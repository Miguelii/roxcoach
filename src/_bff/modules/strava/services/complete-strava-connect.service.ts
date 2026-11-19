import 'server-only'

import { Effect } from 'effect'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, StravaOAuthStateError, StravaPayloadError } from '@/_bff/lib/errors'
import { Logger } from '@/_bff/lib/server-logger'
import { STRAVA_REQUIRED_SCOPE, STRAVA_TOKEN_URL } from '@/_bff/modules/strava/constants'
import { stravaOAuthPost } from '@/_bff/modules/strava/helpers/strava-api.client'
import { getStravaCredentials } from '@/_bff/modules/strava/helpers/strava-credentials.helper'
import { oauthStatesMatch } from '@/_bff/modules/strava/helpers/strava-oauth-state.helper'
import {
    stravaTokenResponseSchema,
    toStoredTokens,
} from '@/_bff/modules/strava/helpers/strava-schemas.helper'
import { upsertConnection } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { enqueueBackfill } from '@/_bff/modules/strava/services/enqueue-strava-jobs.service'

// `userId` comes from the verified session, never from the query string.
type CallbackInput = {
    userId: string
    code: string | null
    scope: string | null
    state: string | null
    error: string | null
    stateCookie: string | null
}

type ConnectOutcome = 'connected' | 'denied' | 'scope'

// Strava returns the granted scopes comma separated; a lookalike such as `activity:read_all_x`
// must not pass, so the check is on whole entries.
const grantsRequiredScope = (scope: string) =>
    scope.split(',').some((entry) => entry.trim() === STRAVA_REQUIRED_SCOPE)

// Handles the OAuth redirect. Order: the state is verified first (even on a denial), then a denial
// or a missing code gives `denied`, a scope without `activity:read_all` gives `scope`, and only
// then is the code exchanged. In every non-connected outcome nothing is stored. A failed exchange
// (a replayed code gets a 400, a 401 or 403 from Strava) fails here and never deletes anything.
export const completeStravaConnect = Effect.fn('completeStravaConnect')(function* (
    input: CallbackInput
) {
    if (!input.state || !input.stateCookie)
        return yield* new StravaOAuthStateError({
            cause: input.state ? 'state cookie missing' : 'state parameter missing',
            error_hash: ErrorCode.STRAVA_CONNECT_STATE_MISSING,
        })

    if (!oauthStatesMatch(input.state, input.stateCookie))
        return yield* new StravaOAuthStateError({
            cause: 'state does not match its cookie',
            error_hash: ErrorCode.STRAVA_CONNECT_STATE_MISMATCH,
        })

    if (input.error !== null || !input.code) return 'denied' satisfies ConnectOutcome
    const { scope } = input
    if (scope === null || !grantsRequiredScope(scope)) return 'scope' satisfies ConnectOutcome

    const { clientId, clientSecret } = yield* getStravaCredentials()

    // Created before the exchange: a client failure must not spend the single-use code.
    const supabase = yield* Effect.tryPromise({
        try: async () => createDBAdminClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.STRAVA_CONNECT_SB_CLIENT }),
    })

    const response = yield* stravaOAuthPost(
        STRAVA_TOKEN_URL,
        {
            client_id: clientId,
            client_secret: clientSecret,
            code: input.code,
            grant_type: 'authorization_code',
        },
        stravaTokenResponseSchema
    )

    if (!response.athlete)
        return yield* new StravaPayloadError({
            cause: 'token response has no athlete id',
            error_hash: ErrorCode.STRAVA_CONNECT_NO_ATHLETE,
        })

    yield* upsertConnection(supabase, input.userId, {
        strava_athlete_id: response.athlete.id,
        ...toStoredTokens(response),
        scope,
        connected_at: new Date().toISOString(),
    })

    // The connection stands even when the backfill cannot be queued: "Sync now" recovers it.
    yield* enqueueBackfill(input.userId).pipe(
        Effect.catch((error) =>
            Effect.sync(() =>
                Logger({
                    level: 'error',
                    prefix: 'completeStravaConnect',
                    message: 'Could not enqueue the initial Strava backfill',
                    error: { tag: error._tag, error_hash: error.error_hash },
                    userId: input.userId,
                })
            )
        )
    )

    return 'connected' satisfies ConnectOutcome
})
