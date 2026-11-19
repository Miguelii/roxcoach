import 'server-only'

import { Effect } from 'effect'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, StravaNotConnectedError } from '@/_bff/lib/errors'
import { STRAVA_TOKEN_URL, TOKEN_REFRESH_MARGIN_S } from '@/_bff/modules/strava/constants'
import { stravaOAuthPost } from '@/_bff/modules/strava/helpers/strava-api.client'
import { getStravaCredentials } from '@/_bff/modules/strava/helpers/strava-credentials.helper'
import {
    stravaTokenResponseSchema,
    toStoredTokens,
} from '@/_bff/modules/strava/helpers/strava-schemas.helper'
import {
    selectConnection,
    updateTokensIfRefreshTokenMatches,
} from '@/_bff/modules/strava/repositories/strava-connections.repository'

// An unparseable expiry reads as expired, so the token is refreshed rather than trusted.
const isFresh = (expiresAt: string) =>
    Date.parse(expiresAt) - Date.now() > TOKEN_REFRESH_MARGIN_S * 1000

export const getValidAccessToken = Effect.fn('getValidAccessToken')(function* (userId: string) {
    // strava_connections is service-role only: no client policy and no grant to `authenticated`.
    const supabase = yield* Effect.tryPromise({
        try: async () => createDBAdminClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.STRAVA_TOKEN_SB_CLIENT }),
    })

    const connection = yield* selectConnection(supabase, userId)
    if (connection === null)
        return yield* new StravaNotConnectedError({
            cause: 'no strava connection for user',
            error_hash: ErrorCode.STRAVA_TOKEN_NOT_CONNECTED,
        })

    if (isFresh(connection.expires_at)) return connection.access_token

    const { clientId, clientSecret } = yield* getStravaCredentials()

    // A failed refresh fails here, before any write, so the stored row stays untouched.
    const response = yield* stravaOAuthPost(
        STRAVA_TOKEN_URL,
        {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: connection.refresh_token,
        },
        stravaTokenResponseSchema
    )
    const tokens = toStoredTokens(response)

    // Strava rotates refresh tokens, so the new pair is saved before the access token is used.
    const swapped = yield* updateTokensIfRefreshTokenMatches(
        supabase,
        userId,
        connection.refresh_token,
        tokens
    )
    if (swapped) return tokens.access_token

    // Another job refreshed first and stored its tokens: use those, with no second refresh call.
    const latest = yield* selectConnection(supabase, userId)
    if (latest === null)
        return yield* new StravaNotConnectedError({
            cause: 'strava connection removed during token refresh',
            error_hash: ErrorCode.STRAVA_TOKEN_NOT_CONNECTED_AFTER_RACE,
        })

    return latest.access_token
})
