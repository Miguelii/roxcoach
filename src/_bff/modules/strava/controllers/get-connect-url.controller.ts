import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { startStravaConnect } from '@/_bff/modules/strava/services/start-strava-connect.service'

// A mutation, not a query: it sets the OAuth state cookie.
export const GET_CONNECT_URL_PROTECTED_CONTROLLER = protectedProcedure.mutation(() =>
    runEffect(startStravaConnect(), 'startStravaConnect', (error) =>
        Match.value(error).pipe(
            Match.tag('StravaNotConfiguredError', () => 'PRECONDITION_FAILED' as const),
            Match.tag('StravaOAuthStateError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
