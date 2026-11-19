import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { syncNow } from '@/_bff/modules/strava/services/sync-now.service'

export const SYNC_NOW_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(syncNow(ctx.user.id), 'syncNow', (error) =>
        Match.value(error).pipe(
            Match.tag('StravaNotConnectedError', () => 'PRECONDITION_FAILED' as const),
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('StravaConnectionError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('EnqueueStravaJobError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
