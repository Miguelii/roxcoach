import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityQueryError, ActivityWriteError } from '@/_bff/lib/errors'
import type { LapDTO, LapRow, TrainingClient } from '@/_bff/modules/training/types'

type ReturnedError = Pick<PostgrestError, 'code' | 'message'>

const TABLE = 'activity_laps'

const COLUMNS =
    'lap_index, name, distance_m, elapsed_time_s, moving_time_s, avg_hr, avg_speed_mps, station'

// PostgREST serializes numeric as a JSON number, but a string is accepted too.
const numeric = z
    .union([
        z.number(),
        z
            .string()
            .regex(/^-?\d+(\.\d+)?$/u)
            .transform(Number),
    ])
    .nullable()

const lapRowSchema = z.object({
    lap_index: z.number().int(),
    name: z.string().nullable(),
    distance_m: numeric,
    elapsed_time_s: numeric,
    moving_time_s: numeric,
    avg_hr: numeric,
    avg_speed_mps: numeric,
    station: z
        .enum([
            'ski_erg',
            'sled_push',
            'sled_pull',
            'burpee_broad_jump',
            'rowing',
            'farmers_carry',
            'sandbag_lunges',
            'wall_balls',
        ])
        .nullable(),
})

// Only the code and the message of a returned error are kept as the cause (details can echo rows).
const writeError = (error: ReturnedError, error_hash: ErrorCode) =>
    new ActivityWriteError({ cause: `${error.code}: ${error.message}`, error_hash })

// Delete then insert, not atomic: if the insert fails the activity is left without laps, and the
// caller fails and may retry, which rewrites them. An empty list only deletes.
export const replaceLaps = Effect.fn('replaceLaps')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string,
    laps: LapRow[]
) {
    const removed = yield* Effect.tryPromise({
        try: () =>
            supabase.from(TABLE).delete().eq('user_id', userId).eq('activity_id', activityId),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_LAPS_DELETE,
            }),
    })
    if (removed.error) return yield* writeError(removed.error, ErrorCode.TRAINING_LAPS_DELETE_ERR)

    if (laps.length === 0) return

    const inserted = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .insert(laps.map((lap) => ({ ...lap, user_id: userId, activity_id: activityId }))),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_LAPS_INSERT,
            }),
    })
    if (inserted.error) return yield* writeError(inserted.error, ErrorCode.TRAINING_LAPS_INSERT_ERR)
})

export const selectLaps = Effect.fn('selectLaps')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select(COLUMNS)
                .eq('user_id', userId)
                .eq('activity_id', activityId)
                .order('lap_index', { ascending: true }),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_LAPS_SELECT,
            }),
    })

    if (error)
        return yield* new ActivityQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.TRAINING_LAPS_SELECT_ERR,
        })

    const parsed = z.array(lapRowSchema).safeParse(data)
    if (!parsed.success)
        return yield* new ActivityQueryError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.TRAINING_LAPS_SELECT_PARSE,
        })

    return parsed.data.map((row): LapDTO => ({
        lapIndex: row.lap_index,
        name: row.name,
        distanceM: row.distance_m,
        elapsedTimeS: row.elapsed_time_s,
        movingTimeS: row.moving_time_s,
        avgHr: row.avg_hr,
        avgSpeedMps: row.avg_speed_mps,
        station: row.station,
    }))
})

// Which of these activities of the user have at least one lap.
export const selectActivityIdsWithLaps = Effect.fn('selectActivityIdsWithLaps')(function* (
    supabase: TrainingClient,
    userId: string,
    activityIds: string[]
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('activity_id')
                .eq('user_id', userId)
                .in('activity_id', activityIds),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_LAPS_SELECT,
            }),
    })

    if (error)
        return yield* new ActivityQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.TRAINING_LAPS_SELECT_ERR,
        })

    const parsed = z.array(z.object({ activity_id: z.string() })).safeParse(data)
    if (!parsed.success)
        return yield* new ActivityQueryError({
            cause: 'activity_id rows failed schema validation',
            error_hash: ErrorCode.TRAINING_LAPS_SELECT_PARSE,
        })
    return new Set(parsed.data.map((row) => row.activity_id))
})
