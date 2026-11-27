import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { setRunType } from '@/_bff/modules/training/services/set-run-type.service'

export const SET_RUN_TYPE_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ activityId: z.uuid(), runType: z.enum(['long', 'fast', 'none', 'auto']) }))
    .mutation(({ ctx, input }) =>
        runEffect(setRunType(ctx.user, input), 'setRunType', (error) =>
            Match.value(error).pipe(
                Match.tag('ActivityNotFoundError', () => 'NOT_FOUND' as const),
                Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ActivityWriteError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('WeeklyGoalsQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
