import 'server-only'

import { Cause, Effect } from 'effect'
import { z } from 'zod'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { Logger } from '@/_bff/lib/server-logger'
import {
    STRAVA_DEAUTHORIZE_TIMEOUT_MS,
    STRAVA_DEAUTHORIZE_URL,
} from '@/_bff/modules/strava/constants'
import { stravaOAuthPost } from '@/_bff/modules/strava/helpers/strava-api.client'
import { deleteConnection } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { getValidAccessToken } from '@/_bff/modules/strava/services/get-valid-access-token.service'

// Revokes the grant at Strava. Best-effort: any failure (no connection, refresh rejected, network,
// HTTP error, timeout, defect) is logged by tag and swallowed, so it never blocks the disconnect.
// Only the tags reach the log, never a token.
const deauthorize = (userId: string) =>
    getValidAccessToken(userId).pipe(
        Effect.flatMap((accessToken) =>
            stravaOAuthPost(STRAVA_DEAUTHORIZE_URL, { access_token: accessToken }, z.unknown())
        ),
        Effect.timeout(STRAVA_DEAUTHORIZE_TIMEOUT_MS),
        Effect.asVoid,
        Effect.catchCause((cause) =>
            Effect.sync(() =>
                Logger({
                    level: 'warn',
                    prefix: 'disconnectStrava',
                    message: 'Strava deauthorize failed, deleting the connection anyway',
                    error: cause.reasons.map((reason) =>
                        Cause.isFailReason(reason) ? reason.error._tag : reason._tag
                    ),
                    userId,
                })
            )
        )
    )

// The user asked to disconnect: the grant is revoked (best-effort), then the connection row is
// deleted. Activities are kept. With no connection it succeeds (idempotent).
export const disconnectStrava = Effect.fn('disconnectStrava')(function* (userId: string) {
    const supabase = yield* Effect.tryPromise({
        try: async () => createDBAdminClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.STRAVA_DISCONNECT_SB_CLIENT }),
    })

    yield* deauthorize(userId)
    yield* deleteConnection(supabase, userId)

    return { disconnected: true }
})
