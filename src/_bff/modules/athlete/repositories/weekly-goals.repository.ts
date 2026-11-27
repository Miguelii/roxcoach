import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import type { WeeklyGoals } from '@/_bff/core/constants/weekly-goals.constants'
import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { WeeklyGoalsQueryError } from '@/_bff/lib/errors'
import { selectColumns } from '@/_bff/core/db/columns'
import { DbTables } from '@/_bff/core/db/tables'

export type GoalsClient =
    | ReturnType<typeof createDBAdminClient>
    | Awaited<ReturnType<typeof createDBServerClient>>

const COLUMNS = selectColumns(DbTables.WEEKLY_GOALS, [
    'weekly_run_distance_m',
    'long_runs_per_week',
    'fast_runs_per_week',
    'strength_sessions_per_week',
    'short_run_max_m',
    'long_run_min_m',
    'fast_pace_s_per_km',
])

const goalsRowSchema = z.object({
    weekly_run_distance_m: z.number().int().nullable(),
    long_runs_per_week: z.number().int().nullable(),
    fast_runs_per_week: z.number().int().nullable(),
    strength_sessions_per_week: z.number().int().nullable(),
    short_run_max_m: z.number().int(),
    long_run_min_m: z.number().int(),
    fast_pace_s_per_km: z.number().int(),
})

const toWeeklyGoals = (row: z.infer<typeof goalsRowSchema>): WeeklyGoals => ({
    weeklyRunDistanceM: row.weekly_run_distance_m,
    longRunsPerWeek: row.long_runs_per_week,
    fastRunsPerWeek: row.fast_runs_per_week,
    strengthSessionsPerWeek: row.strength_sessions_per_week,
    runTypeRules: {
        shortRunMaxM: row.short_run_max_m,
        longRunMinM: row.long_run_min_m,
        fastPaceSPerKm: row.fast_pace_s_per_km,
    },
})

export const selectWeeklyGoals = Effect.fn('selectWeeklyGoals')(function* (
    supabase: GoalsClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(DbTables.WEEKLY_GOALS)
                .select(COLUMNS)
                .eq('user_id', userId)
                .maybeSingle(),
        catch: (cause) =>
            new WeeklyGoalsQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_GOALS_SELECT,
            }),
    })

    if (error)
        return yield* new WeeklyGoalsQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_GOALS_SELECT_ERR,
        })

    if (data === null) return null

    const parsed = goalsRowSchema.safeParse(data)
    if (!parsed.success)
        return yield* new WeeklyGoalsQueryError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.ATHLETE_GOALS_SELECT_PARSE,
        })

    return toWeeklyGoals(parsed.data)
})

export const upsertWeeklyGoals = Effect.fn('upsertWeeklyGoals')(function* (
    supabase: GoalsClient,
    userId: string,
    goals: WeeklyGoals
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.from(DbTables.WEEKLY_GOALS).upsert(
                {
                    user_id: userId,
                    weekly_run_distance_m: goals.weeklyRunDistanceM,
                    long_runs_per_week: goals.longRunsPerWeek,
                    fast_runs_per_week: goals.fastRunsPerWeek,
                    strength_sessions_per_week: goals.strengthSessionsPerWeek,
                    short_run_max_m: goals.runTypeRules.shortRunMaxM,
                    long_run_min_m: goals.runTypeRules.longRunMinM,
                    fast_pace_s_per_km: goals.runTypeRules.fastPaceSPerKm,
                },
                { onConflict: 'user_id' }
            ),
        catch: (cause) =>
            new WeeklyGoalsQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_GOALS_UPSERT,
            }),
    })

    if (error)
        return yield* new WeeklyGoalsQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_GOALS_UPSERT_ERR,
        })
})
