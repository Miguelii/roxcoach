import 'server-only'

import { cookies } from 'next/headers'
import { Effect } from 'effect'
import { ClientEnv } from '@/env/client'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { StravaOAuthStateError } from '@/_bff/lib/errors'
import {
    STRAVA_AUTHORIZE_URL,
    STRAVA_CALLBACK_PATH,
    STRAVA_SCOPE,
    STRAVA_STATE_COOKIE,
    STRAVA_STATE_MAX_AGE_S,
} from '@/_bff/modules/strava/constants'
import { getStravaCredentials } from '@/_bff/modules/strava/helpers/strava-credentials.helper'
import {
    createOAuthState,
    stateCookieOptions,
} from '@/_bff/modules/strava/helpers/strava-oauth-state.helper'

const cookieError = (cause: unknown) =>
    new StravaOAuthStateError({
        cause: cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown error',
        error_hash: ErrorCode.STRAVA_CONNECT_COOKIE,
    })

// Builds the Strava authorize url. The random `state` goes into an httpOnly cookie scoped to the
// callback path, which the callback compares with the returned `state` (CSRF protection). The
// client secret is never part of the url.
export const startStravaConnect = Effect.fn('startStravaConnect')(function* () {
    const { clientId } = yield* getStravaCredentials()
    const state = createOAuthState()

    const cookieStore = yield* Effect.tryPromise({ try: () => cookies(), catch: cookieError })
    yield* Effect.try({
        try: () =>
            cookieStore.set(STRAVA_STATE_COOKIE, state, stateCookieOptions(STRAVA_STATE_MAX_AGE_S)),
        catch: cookieError,
    })

    const query = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: `${ClientEnv.NEXT_PUBLIC_WEBSITE_URL}${STRAVA_CALLBACK_PATH}`,
        approval_prompt: 'auto',
        scope: STRAVA_SCOPE,
        state,
    })

    return { url: `${STRAVA_AUTHORIZE_URL}?${query.toString()}` }
})
