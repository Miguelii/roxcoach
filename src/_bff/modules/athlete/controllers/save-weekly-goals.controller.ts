import { Match } from 'effect'
import { z } from 'zod'
import { WEEKLY_GOAL_LIMITS as LIMITS } from '@/_bff/core/constants/weekly-goals.constants'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { saveWeeklyGoals } from '@/_bff/modules/athlete/services/save-weekly-goals.service'

const int = (min: number, max: number) => z.number().int().min(min).max(max)

// Field ranges only; validateWeeklyGoals owns shortRunMaxM < longRunMinM.
const SAVE_WEEKLY_GOALS_INPUT = z.object({
    weeklyRunDistanceM: int(LIMITS.weeklyRunDistanceMinM, LIMITS.weeklyRunDistanceMaxM).nullable(),
    longRunsPerWeek: int(LIMITS.runsPerWeekMin, LIMITS.runsPerWeekMax).nullable(),
    fastRunsPerWeek: int(LIMITS.runsPerWeekMin, LIMITS.runsPerWeekMax).nullable(),
    strengthSessionsPerWeek: int(
        LIMITS.strengthSessionsPerWeekMin,
        LIMITS.strengthSessionsPerWeekMax
    ).nullable(),
    runTypeRules: z.object({
        shortRunMaxM: int(1, LIMITS.runTypeDistanceMaxM),
        longRunMinM: int(1, LIMITS.runTypeDistanceMaxM),
        fastPaceSPerKm: int(LIMITS.fastPaceMinSPerKm, LIMITS.fastPaceMaxSPerKm),
    }),
})

export const SAVE_WEEKLY_GOALS_PROTECTED_CONTROLLER = protectedProcedure
    .input(SAVE_WEEKLY_GOALS_INPUT)
    .mutation(({ ctx, input }) =>
        runEffect(saveWeeklyGoals(ctx.user, input), 'saveWeeklyGoals', (error) =>
            Match.value(error).pipe(
                Match.tag('WeeklyGoalsValidationError', () => 'BAD_REQUEST' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('WeeklyGoalsQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ActivityWriteError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
