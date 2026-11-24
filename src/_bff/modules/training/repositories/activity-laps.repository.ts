import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityQueryError, ActivityWriteError } from '@/_bff/lib/errors'
import type { LapDTO, LapRow, TrainingClient } from '@/_bff/modules/training/types'
import { selectColumns } from '@/_bff/core/db/columns'
import { DbTables } from '@/_bff/core/db/tables'

type ReturnedError = Pick<PostgrestError, 'code' | 'message'>

const COLUMNS = selectColumns(DbTables.ACTIVITY_LAPS, [
    'lap_index',
    'name',
    'distance_m',
    'elapsed_time_s',
    'moving_time_s',
    'avg_hr',
    'avg_speed_mps',
    'station',
])

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

// For an activity that has no laps yet (just created): no delete first. An empty list does nothing.
export const insertLaps = Effect.fn('insertLaps')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string,
    laps: LapRow[]
) {
    if (laps.length === 0) return

    const inserted = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(DbTables.ACTIVITY_LAPS)
                .insert(laps.map((lap) => ({ ...lap, user_id: userId, activity_id: activityId }))),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_LAPS_INSERT,
            }),
    })
    if (inserted.error) return yield* writeError(inserted.error, ErrorCode.TRAINING_LAPS_INSERT_ERR)
})

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
            supabase
                .from(DbTables.ACTIVITY_LAPS)
                .delete()
                .eq('user_id', userId)
                .eq('activity_id', activityId),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_LAPS_DELETE,
            }),
    })
    if (removed.error) return yield* writeError(removed.error, ErrorCode.TRAINING_LAPS_DELETE_ERR)

    yield* insertLaps(supabase, userId, activityId, laps)
})

export const selectLaps = Effect.fn('selectLaps')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(DbTables.ACTIVITY_LAPS)
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

const LAP_ID_CHUNK_SIZE = 200
const LAP_PAGE_SIZE = 500

// Which of these activities of the user have at least one lap. Chunked and paged because it
// returns one row per lap, which exceeds PostgREST's max rows for a year of runs.
export const selectActivityIdsWithLaps = Effect.fn('selectActivityIdsWithLaps')(function* (
    supabase: TrainingClient,
    userId: string,
    activityIds: string[]
) {
    const withLaps = new Set<string>()

    for (let start = 0; start < activityIds.length; start += LAP_ID_CHUNK_SIZE) {
        const chunk = activityIds.slice(start, start + LAP_ID_CHUNK_SIZE)

        for (let from = 0; ; from += LAP_PAGE_SIZE) {
            const { data, error } = yield* Effect.tryPromise({
                try: () =>
                    supabase
                        .from(DbTables.ACTIVITY_LAPS)
                        .select(selectColumns(DbTables.ACTIVITY_LAPS, ['activity_id']))
                        .eq('user_id', userId)
                        .in('activity_id', chunk)
                        .order('activity_id')
                        .order('lap_index')
                        .range(from, from + LAP_PAGE_SIZE - 1),
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

            parsed.data.forEach((row) => withLaps.add(row.activity_id))
            if (parsed.data.length < LAP_PAGE_SIZE) break
        }
    }

    return withLaps
})
