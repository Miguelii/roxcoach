import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getWeeklyGoals } from '@/_bff/modules/athlete/services/get-weekly-goals.service'

export const GET_WEEKLY_GOALS_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(getWeeklyGoals(ctx.user), 'getWeeklyGoals', (error) =>
        Match.value(error).pipe(
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('WeeklyGoalsQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
