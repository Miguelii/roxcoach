import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getStravaStatus } from '@/_bff/modules/strava/services/get-strava-status.service'

export const GET_STATUS_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(getStravaStatus(ctx.user.id), 'getStravaStatus', (error) =>
        Match.value(error).pipe(
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('StravaConnectionError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
