import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityQueryError } from '@/_bff/lib/errors'
import type { ActivityDTO, TrainingClient } from '@/_bff/modules/training/types'

type ReturnedError = Pick<PostgrestError, 'code' | 'message'>

const TABLE = 'activities'

const COLUMNS =
    'id, source, category, name, started_at, local_date, distance_m, moving_time_s, elapsed_time_s, elevation_gain_m, avg_hr, max_hr, avg_speed_mps, calories, perceived_effort, notes'

// PostgREST serializes numeric and bigint as JSON numbers, but a string is accepted too.
const numeric = z
    .union([
        z.number(),
        z
            .string()
            .regex(/^-?\d+(\.\d+)?$/u)
            .transform(Number),
    ])
    .nullable()

const activityRowSchema = z.object({
    id: z.string(),
    source: z.enum(['strava', 'manual']),
    category: z.enum(['run', 'hyrox', 'strength', 'cross', 'other']),
    name: z.string(),
    started_at: z.string(),
    local_date: z.string(),
    distance_m: numeric,
    moving_time_s: numeric,
    elapsed_time_s: numeric,
    elevation_gain_m: numeric,
    avg_hr: numeric,
    max_hr: numeric,
    avg_speed_mps: numeric,
    calories: numeric,
    perceived_effort: numeric,
    notes: z.string().nullable(),
})

// Postgres errors can echo the failing row in `details` or `hint`, so only the code and the
// message of a returned error are kept as the cause.
const queryError = (error: ReturnedError, error_hash: ErrorCode) =>
    new ActivityQueryError({ cause: `${error.code}: ${error.message}`, error_hash })

const toDTO = (row: z.infer<typeof activityRowSchema>): ActivityDTO => ({
    id: row.id,
    source: row.source,
    category: row.category,
    name: row.name,
    startedAt: row.started_at,
    localDate: row.local_date,
    distanceM: row.distance_m,
    movingTimeS: row.moving_time_s,
    elapsedTimeS: row.elapsed_time_s,
    elevationGainM: row.elevation_gain_m,
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    avgSpeedMps: row.avg_speed_mps,
    calories: row.calories,
    perceivedEffort: row.perceived_effort,
    notes: row.notes,
})

const parseError = (issues: z.core.$ZodIssue[], error_hash: ErrorCode) =>
    new ActivityQueryError({
        cause: `Row failed schema validation: ${issues.map((issue) => issue.path.join('.')).join(', ')}`,
        error_hash,
    })

// `from` and `to` are plain YYYY-MM-DD strings compared against the date column, never via Date.
export const selectActivitiesInRange = Effect.fn('selectActivitiesInRange')(function* (
    supabase: TrainingClient,
    userId: string,
    from: string,
    to: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select(COLUMNS)
                .eq('user_id', userId)
                .is('deleted_at', null)
                .gte('local_date', from)
                .lte('local_date', to)
                .order('started_at', { ascending: true }),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_RANGE,
            }),
    })

    if (error) return yield* queryError(error, ErrorCode.TRAINING_ACTIVITY_RANGE_ERR)

    const parsed = z.array(activityRowSchema).safeParse(data)
    if (!parsed.success)
        return yield* parseError(parsed.error.issues, ErrorCode.TRAINING_ACTIVITY_RANGE_PARSE)

    return parsed.data.map(toDTO)
})

export const selectActivityById = Effect.fn('selectActivityById')(function* (
    supabase: TrainingClient,
    userId: string,
    id: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select(COLUMNS)
                .eq('id', id)
                .eq('user_id', userId)
                .is('deleted_at', null)
                .maybeSingle(),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_BY_ID,
            }),
    })

    if (error) return yield* queryError(error, ErrorCode.TRAINING_ACTIVITY_BY_ID_ERR)
    if (data === null) return null

    const parsed = activityRowSchema.safeParse(data)
    if (!parsed.success)
        return yield* parseError(parsed.error.issues, ErrorCode.TRAINING_ACTIVITY_BY_ID_PARSE)

    return toDTO(parsed.data)
})
