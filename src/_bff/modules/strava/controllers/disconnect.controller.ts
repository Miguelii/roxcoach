import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { disconnectStrava } from '@/_bff/modules/strava/services/disconnect-strava.service'

export const DISCONNECT_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(disconnectStrava(ctx.user.id), 'disconnectStrava', (error) =>
        Match.value(error).pipe(
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('StravaConnectionError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
