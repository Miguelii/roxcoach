import 'server-only'

import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { StravaNotConfiguredError } from '@/_bff/lib/errors'
import { ServerEnv } from '@/env/server'

// Reads the Strava OAuth app credentials. The cause names which variable is missing, never a value.
export const getStravaCredentials = Effect.fn('getStravaCredentials')(function* () {
    const clientId = ServerEnv.NEXT_STRAVA_CLIENT_ID
    const clientSecret = ServerEnv.NEXT_STRAVA_CLIENT_SECRET

    if (!clientId || !clientSecret)
        return yield* new StravaNotConfiguredError({
            cause: `${clientId ? 'NEXT_STRAVA_CLIENT_SECRET' : 'NEXT_STRAVA_CLIENT_ID'} is not set`,
            error_hash: ErrorCode.STRAVA_NOT_CONFIGURED,
        })

    return { clientId, clientSecret }
})
