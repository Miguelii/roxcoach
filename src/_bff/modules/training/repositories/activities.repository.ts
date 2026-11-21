import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityQueryError, ActivityWriteError } from '@/_bff/lib/errors'
import type {
    ActivityDTO,
    LyftaActivityRow,
    NewActivityRow,
    TrainingClient,
} from '@/_bff/modules/training/types'
import { parseHrHistogram } from '@/_bff/modules/training/helpers/build-hr-histogram.helper'
import type { HrHistogram } from '@/_bff/modules/training/types/progress'

type ReturnedError = Pick<PostgrestError, 'code' | 'message'>

const TABLE = 'activities'

const COLUMNS =
    'id, source, category, name, started_at, local_date, distance_m, moving_time_s, elapsed_time_s, elevation_gain_m, avg_hr, max_hr, avg_speed_mps, calories, body_weight_kg, lyfta_total_volume_kg_reps, perceived_effort, notes'

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
    source: z.enum(['strava', 'manual', 'lyfta']),
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
    body_weight_kg: numeric,
    lyfta_total_volume_kg_reps: numeric,
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
    bodyWeightKg: row.body_weight_kg,
    lyftaTotalVolumeKgReps: row.lyfta_total_volume_kg_reps,
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

const writeError = (error: ReturnedError, error_hash: ErrorCode) =>
    new ActivityWriteError({ cause: `${error.code}: ${error.message}`, error_hash })

// Manual uploads only: the source is always 'manual'.
export const insertActivity = Effect.fn('insertActivity')(function* (
    supabase: TrainingClient,
    userId: string,
    row: NewActivityRow
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .insert({ ...row, source: 'manual', user_id: userId })
                .select('id')
                .single(),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_INSERT,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_ACTIVITY_INSERT_ERR)
    if (data === null)
        return yield* new ActivityWriteError({
            cause: 'insert returned no row',
            error_hash: ErrorCode.TRAINING_ACTIVITY_INSERT_ERR,
        })

    return data.id
})

const backfillTargetSchema = z.object({
    id: z.string(),
    // One activity has one file in practice, but PostgREST returns the one-to-many embed as an array.
    activity_files: z.array(z.object({ storage_path: z.string() })),
})

// Activities of the user whose histogram was never computed and that still have a parsed file.
export const selectBackfillTargets = Effect.fn('selectBackfillTargets')(function* (
    supabase: TrainingClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('id, activity_files!inner(storage_path)')
                .eq('user_id', userId)
                .is('hr_histogram', null)
                .is('deleted_at', null)
                .eq('activity_files.status', 'parsed')
                .order('started_at', { ascending: true }),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_HR_BACKFILL_SELECT,
            }),
    })

    if (error) return yield* queryError(error, ErrorCode.TRAINING_HR_BACKFILL_SELECT_ERR)

    const parsed = z.array(backfillTargetSchema).safeParse(data)
    if (!parsed.success)
        return yield* parseError(parsed.error.issues, ErrorCode.TRAINING_HR_BACKFILL_SELECT_PARSE)

    return parsed.data.flatMap((row) => {
        const file = row.activity_files[0]
        return file === undefined ? [] : [{ activityId: row.id, storagePath: file.storage_path }]
    })
})

export const updateHrHistogram = Effect.fn('updateHrHistogram')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string,
    histogram: HrHistogram
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ hr_histogram: histogram })
                .eq('id', activityId)
                .eq('user_id', userId),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_HR_HISTOGRAM_UPDATE,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_HR_HISTOGRAM_UPDATE_ERR)
})

export const upsertLyftaActivity = Effect.fn('upsertLyftaActivity')(function* (
    supabase: TrainingClient,
    userId: string,
    row: LyftaActivityRow
) {
    const { data: existing, error: lookupError } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('id')
                .eq('user_id', userId)
                .eq('source', 'lyfta')
                .eq('source_id', row.source_id)
                .maybeSingle(),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_LYFTA_ACTIVITY_SELECT,
            }),
    })

    if (lookupError)
        return yield* new ActivityQueryError({
            cause: `${lookupError.code}: ${lookupError.message}`,
            error_hash: ErrorCode.TRAINING_LYFTA_ACTIVITY_SELECT_ERR,
        })

    const writeRow = {
        ...row,
        user_id: userId,
        source: 'lyfta' as const,
        distance_m: null,
        moving_time_s: null,
        elevation_gain_m: null,
        avg_hr: null,
        max_hr: null,
        avg_speed_mps: null,
        calories: null,
    }

    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .upsert(writeRow, {
                    onConflict: 'user_id,source,source_id',
                    defaultToNull: false,
                })
                .select('id')
                .single(),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_LYFTA_ACTIVITY_UPSERT,
            }),
    })

    if (error)
        return yield* new ActivityWriteError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.TRAINING_LYFTA_ACTIVITY_UPSERT_ERR,
        })
    if (data === null)
        return yield* new ActivityWriteError({
            cause: 'Lyfta activity upsert returned no row',
            error_hash: ErrorCode.TRAINING_LYFTA_ACTIVITY_UPSERT_ERR,
        })

    return { activityId: data.id, created: existing === null }
})

// The id of the user's non-deleted activity that started at that instant, or null.
export const selectIdByStartedAt = Effect.fn('selectIdByStartedAt')(function* (
    supabase: TrainingClient,
    userId: string,
    startedAt: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('id')
                .eq('user_id', userId)
                .eq('started_at', startedAt)
                .is('deleted_at', null)
                .limit(1)
                .maybeSingle(),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_START_LOOKUP,
            }),
    })

    if (error) return yield* queryError(error, ErrorCode.TRAINING_ACTIVITY_START_LOOKUP_ERR)

    return data?.id ?? null
})

// Hard delete, used only to undo an insert of the same request (laps and files cascade).
export const deleteActivity = Effect.fn('deleteActivity')(function* (
    supabase: TrainingClient,
    userId: string,
    id: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).delete().eq('user_id', userId).eq('id', id).select('id'),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_DELETE,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_ACTIVITY_DELETE_ERR)
    // RLS or a mismatched id removes nothing without an error, so zero rows is a failure.
    if (!data || data.length === 0)
        return yield* new ActivityWriteError({
            cause: 'delete removed no row',
            error_hash: ErrorCode.TRAINING_ACTIVITY_DELETE_ERR,
        })
})

const runRowSchema = z.object({
    local_date: z.string(),
    distance_m: numeric,
    moving_time_s: numeric,
    // Validated by parseHrHistogram: a corrupt value must not fail the whole request.
    hr_histogram: z.unknown(),
})

// Runs bounded by `from` and `to` (plain YYYY-MM-DD), oldest first.
export const selectRunsInRange = Effect.fn('selectRunsInRange')(function* (
    supabase: TrainingClient,
    userId: string,
    from: string,
    to: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('local_date, distance_m, moving_time_s, hr_histogram')
                .eq('user_id', userId)
                .eq('category', 'run')
                .is('deleted_at', null)
                .gte('local_date', from)
                .lte('local_date', to)
                .order('started_at', { ascending: true }),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_RUN_PROGRESS_SELECT,
            }),
    })

    if (error) return yield* queryError(error, ErrorCode.TRAINING_RUN_PROGRESS_SELECT_ERR)

    const parsed = z.array(runRowSchema).safeParse(data)
    if (!parsed.success)
        return yield* parseError(parsed.error.issues, ErrorCode.TRAINING_RUN_PROGRESS_SELECT_PARSE)

    return parsed.data.map((row) => ({
        localDate: row.local_date,
        distanceM: row.distance_m,
        movingTimeS: row.moving_time_s,
        hrHistogram: parseHrHistogram(row.hr_histogram),
    }))
})

const strengthWorkoutRowSchema = z.object({
    id: z.string(),
    local_date: z.string(),
    body_weight_kg: numeric,
})

// Strength workouts bounded by `from` and `to` (plain YYYY-MM-DD), oldest first.
export const selectStrengthWorkoutsInRange = Effect.fn('selectStrengthWorkoutsInRange')(function* (
    supabase: TrainingClient,
    userId: string,
    from: string,
    to: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('id, local_date, body_weight_kg')
                .eq('user_id', userId)
                .eq('category', 'strength')
                .is('deleted_at', null)
                .gte('local_date', from)
                .lte('local_date', to)
                .order('started_at', { ascending: true }),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_STRENGTH_WORKOUTS_SELECT,
            }),
    })

    if (error) return yield* queryError(error, ErrorCode.TRAINING_STRENGTH_WORKOUTS_SELECT_ERR)

    const parsed = z.array(strengthWorkoutRowSchema).safeParse(data)
    if (!parsed.success)
        return yield* parseError(
            parsed.error.issues,
            ErrorCode.TRAINING_STRENGTH_WORKOUTS_SELECT_PARSE
        )

    return parsed.data.map((row) => ({
        activityId: row.id,
        localDate: row.local_date,
        bodyWeightKg: row.body_weight_kg,
    }))
})
