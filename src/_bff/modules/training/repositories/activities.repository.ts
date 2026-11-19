import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityQueryError, ActivityWriteError } from '@/_bff/lib/errors'
import type { ActivityRow } from '@/_bff/modules/strava/helpers/map-strava-activity.helper'
import type { ActivityDTO, TrainingClient } from '@/_bff/modules/training/types'

type ReturnedError = Pick<PostgrestError, 'code' | 'message'>

const TABLE = 'activities'

const COLUMNS =
    'id, source, strava_id, category, name, started_at, local_date, distance_m, moving_time_s, elapsed_time_s, elevation_gain_m, avg_hr, max_hr, avg_speed_mps, calories, perceived_effort, notes'

// Postgres code of a unique violation: two syncs of the same activity raced to insert it.
const UNIQUE_VIOLATION = '23505'

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
    strava_id: numeric,
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
const writeError = (error: ReturnedError, error_hash: ErrorCode) =>
    new ActivityWriteError({ cause: `${error.code}: ${error.message}`, error_hash })

const queryError = (error: ReturnedError, error_hash: ErrorCode) =>
    new ActivityQueryError({ cause: `${error.code}: ${error.message}`, error_hash })

const toDTO = (row: z.infer<typeof activityRowSchema>): ActivityDTO => ({
    id: row.id,
    source: row.source,
    stravaId: row.strava_id,
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

// The partial unique index (user_id, strava_id) where strava_id is not null cannot be the target
// of a PostgREST `onConflict`: Postgres only infers a partial index when the ON CONFLICT clause
// repeats its predicate, which PostgREST cannot express. So the upsert is a lookup by
// (user_id, strava_id) followed by an update or an insert. If a concurrent sync inserts the row
// between the lookup and the insert, the unique violation is resolved by looking the row up again
// and updating it, so the operation stays idempotent.
const findIdByStravaId = Effect.fn('findIdByStravaId')(function* (
    supabase: TrainingClient,
    userId: string,
    stravaId: number
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('id')
                .eq('user_id', userId)
                .eq('strava_id', stravaId)
                .maybeSingle(),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_FIND,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_ACTIVITY_FIND_ERR)

    return data === null ? null : String(data.id)
})

const updateById = Effect.fn('updateById')(function* (
    supabase: TrainingClient,
    userId: string,
    id: string,
    row: ActivityRow
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ ...row, deleted_at: null })
                .eq('id', id)
                .eq('user_id', userId),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_UPDATE,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_ACTIVITY_UPDATE_ERR)

    return id
})

export const upsertStravaActivity = Effect.fn('upsertStravaActivity')(function* (
    supabase: TrainingClient,
    userId: string,
    row: ActivityRow
) {
    const existingId = yield* findIdByStravaId(supabase, userId, row.strava_id)
    if (existingId !== null) return yield* updateById(supabase, userId, existingId, row)

    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .insert({ ...row, user_id: userId, deleted_at: null })
                .select('id')
                .single(),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_INSERT,
            }),
    })

    if (error?.code === UNIQUE_VIOLATION) {
        const winnerId = yield* findIdByStravaId(supabase, userId, row.strava_id)
        if (winnerId !== null) return yield* updateById(supabase, userId, winnerId, row)
    }
    if (error) return yield* writeError(error, ErrorCode.TRAINING_ACTIVITY_INSERT_ERR)

    return String(data.id)
})

// Only rows not yet deleted are touched, so a redelivered delete event keeps the first timestamp.
export const softDeleteByStravaId = Effect.fn('softDeleteByStravaId')(function* (
    supabase: TrainingClient,
    userId: string,
    stravaId: number
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ deleted_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('strava_id', stravaId)
                .is('deleted_at', null),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_SOFT_DELETE,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_ACTIVITY_SOFT_DELETE_ERR)
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

export const countStravaActivities = Effect.fn('countStravaActivities')(function* (
    supabase: TrainingClient,
    userId: string
) {
    const { count, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .not('strava_id', 'is', null)
                .is('deleted_at', null),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_ACTIVITY_COUNT,
            }),
    })

    if (error) return yield* queryError(error, ErrorCode.TRAINING_ACTIVITY_COUNT_ERR)

    return count ?? 0
})
