import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { stravaApiGet } from '@/_bff/modules/strava/helpers/strava-api.client'
import { deleteConnection } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { getValidAccessToken } from '@/_bff/modules/strava/services/get-valid-access-token.service'
import { createSyncClient } from '@/_bff/modules/strava/services/sync-strava-activity.service'

type TokenOutcome =
    | { kind: 'token'; accessToken: string }
    | { kind: 'rejected' }
    | { kind: 'not_connected' }

// Strava answers a revoked or invalid refresh token with 400 (invalid grant). A 401 or 403 from the
// token endpoint is not a confirmation: an invalid or rotated client secret also gives 401, and
// trusting it would let a forged event disconnect valid grants. Those failures propagate.
const acquireToken = (userId: string) =>
    getValidAccessToken(userId).pipe(
        Effect.map((accessToken): TokenOutcome => ({ kind: 'token', accessToken })),
        Effect.catchTag('StravaNotConnectedError', () =>
            Effect.succeed<TokenOutcome>({ kind: 'not_connected' })
        ),
        Effect.catchTag('StravaApiError', (error) =>
            error.status === 400
                ? Effect.succeed<TokenOutcome>({ kind: 'rejected' })
                : Effect.fail(error)
        )
    )

// The webhook is unsigned, so a deauthorization event is only a hint. The connection is deleted
// only when Strava itself confirms the grant is gone: the refresh is rejected with 400 (read twice,
// because a refresh race loser can see a spurious rejection while the winner stored fresh tokens),
// or `GET /athlete` answers exactly 401. Anything else (success, 403, 429, 5xx, network) keeps the
// connection, and the failures propagate so the job retries or fails visibly.
export const verifyStravaDeauthorization = Effect.fn('verifyStravaDeauthorization')(function* (
    userId: string
) {
    const supabase = yield* createSyncClient(ErrorCode.STRAVA_VERIFY_SB_CLIENT)

    const first = yield* acquireToken(userId)
    const outcome = first.kind === 'rejected' ? yield* acquireToken(userId) : first

    if (outcome.kind === 'not_connected') return { disconnected: false }

    const revoked =
        outcome.kind === 'rejected' ||
        (yield* stravaApiGet('/athlete', outcome.accessToken, z.unknown()).pipe(
            Effect.map(() => false),
            Effect.catchTag('StravaUnauthorizedError', (error) =>
                error.status === 401 ? Effect.succeed(true) : Effect.fail(error)
            )
        ))

    if (!revoked) return { disconnected: false }

    yield* deleteConnection(supabase, userId)
    return { disconnected: true }
})
