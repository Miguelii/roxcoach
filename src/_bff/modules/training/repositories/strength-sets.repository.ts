import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityQueryError, ActivityWriteError } from '@/_bff/lib/errors'
import type {
    NewStrengthSetRow,
    StrengthSetDTO,
    TrainingClient,
} from '@/_bff/modules/training/types'
import { DbTables } from '@/_bff/core/db/tables'

type ReturnedError = { code: string; message: string }

const numeric = z
    .union([
        z.number(),
        z
            .string()
            .regex(/^-?\d+(?:\.\d+)?$/u)
            .transform(Number),
    ])
    .nullable()

const lyftaRecordSchema = z.object({
    type: z.number().int(),
    level: z.number().nullable(),
    value: z.number().nullable(),
})

const strengthSetRowSchema = z.object({
    exercise: z.string(),
    exercise_index: z.number().int().nullable(),
    exercise_image_url: z.string().nullable(),
    source_exercise_id: z.string().nullable(),
    set_index: z.number().int(),
    reps: z.number().int().nullable(),
    load_kg: numeric,
    rir: z.number().int().nullable(),
    rpe: numeric,
    lyfta_records: z.array(lyftaRecordSchema).nullish(),
})

const selectError = (error: ReturnedError, error_hash: ErrorCode) =>
    new ActivityQueryError({ cause: `${error.code}: ${error.message}`, error_hash })

const writeError = (error: ReturnedError, error_hash: ErrorCode) =>
    new ActivityWriteError({ cause: `${error.code}: ${error.message}`, error_hash })

export const selectStrengthSets = Effect.fn('selectStrengthSets')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(DbTables.STRENGTH_SETS)
                .select(
                    'exercise, exercise_index, exercise_image_url, source_exercise_id, set_index, reps, load_kg, rir, rpe, lyfta_records'
                )
                .eq('user_id', userId)
                .eq('activity_id', activityId)
                .order('exercise_index', { ascending: true })
                .order('set_index', { ascending: true })
                .order('exercise', { ascending: true }),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_STRENGTH_SETS_SELECT,
            }),
    })

    if (error) return yield* selectError(error, ErrorCode.TRAINING_STRENGTH_SETS_SELECT_ERR)

    const parsed = z.array(strengthSetRowSchema).safeParse(data)
    if (!parsed.success)
        return yield* new ActivityQueryError({
            cause: `Rows failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.TRAINING_STRENGTH_SETS_SELECT_PARSE,
        })

    return parsed.data.map((row): StrengthSetDTO => ({
        exercise: row.exercise,
        exerciseIndex: row.exercise_index,
        exerciseImageUrl: row.exercise_image_url,
        sourceExerciseId: row.source_exercise_id,
        setIndex: row.set_index,
        reps: row.reps,
        loadKg: row.load_kg,
        rir: row.rir,
        rpe: row.rpe,
        lyftaRecords: row.lyfta_records ?? [],
    }))
})

export const deleteStrengthSets = Effect.fn('deleteStrengthSets')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(DbTables.STRENGTH_SETS)
                .delete()
                .eq('user_id', userId)
                .eq('activity_id', activityId),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_STRENGTH_SETS_DELETE,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_STRENGTH_SETS_DELETE_ERR)
})

export const insertStrengthSets = Effect.fn('insertStrengthSets')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string,
    sets: NewStrengthSetRow[]
) {
    if (sets.length === 0) return

    const rows = sets.map((set) => ({
        user_id: userId,
        activity_id: activityId,
        exercise: set.exercise,
        exercise_index: set.exercise_index,
        exercise_image_url: set.exercise_image_url,
        source_exercise_id: set.source_exercise_id ?? null,
        set_index: set.set_index,
        reps: set.reps,
        load_kg: set.load_kg,
        rir: set.rir ?? null,
        rpe: null,
        lyfta_records: set.lyfta_records ?? null,
    }))

    const { error } = yield* Effect.tryPromise({
        try: () => supabase.from(DbTables.STRENGTH_SETS).insert(rows),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_STRENGTH_SETS_INSERT,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_STRENGTH_SETS_INSERT_ERR)
})

const progressSetRowSchema = z.object({
    activity_id: z.string(),
    exercise: z.string(),
    exercise_image_url: z.string().nullable(),
    source_exercise_id: z.string().nullable(),
    reps: z.number().int().nullable(),
    load_kg: numeric,
})

const ID_CHUNK_SIZE = 100
const PAGE_SIZE = 500

// Sets of many workouts, queried in chunks so the `in` filter stays within the URL length limit.
// A chunk holds far more rows than PostgREST's max rows, so each one is paged by a stable order.
export const selectSetsForActivities = Effect.fn('selectSetsForActivities')(function* (
    supabase: TrainingClient,
    userId: string,
    activityIds: string[]
) {
    const chunks: string[][] = []
    for (let index = 0; index < activityIds.length; index += ID_CHUNK_SIZE)
        chunks.push(activityIds.slice(index, index + ID_CHUNK_SIZE))

    const results = yield* Effect.forEach(
        chunks,
        (chunk) =>
            Effect.gen(function* () {
                const rows: z.infer<typeof progressSetRowSchema>[] = []

                for (let from = 0; ; from += PAGE_SIZE) {
                    const { data, error } = yield* Effect.tryPromise({
                        try: () =>
                            supabase
                                .from(DbTables.STRENGTH_SETS)
                                .select(
                                    'activity_id, exercise, exercise_image_url, source_exercise_id, reps, load_kg'
                                )
                                .eq('user_id', userId)
                                .in('activity_id', chunk)
                                .order('id')
                                .range(from, from + PAGE_SIZE - 1),
                        catch: (cause) =>
                            new ActivityQueryError({
                                cause: String(cause),
                                error_hash: ErrorCode.TRAINING_PROGRESS_SETS_SELECT,
                            }),
                    })

                    if (error)
                        return yield* selectError(
                            error,
                            ErrorCode.TRAINING_PROGRESS_SETS_SELECT_ERR
                        )

                    const parsed = z.array(progressSetRowSchema).safeParse(data)
                    if (!parsed.success)
                        return yield* new ActivityQueryError({
                            cause: `Rows failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
                            error_hash: ErrorCode.TRAINING_PROGRESS_SETS_SELECT_PARSE,
                        })

                    rows.push(...parsed.data)
                    if (parsed.data.length < PAGE_SIZE) break
                }

                return rows
            }),
        { concurrency: 3 }
    )

    return results.flat().map((row) => ({
        activityId: row.activity_id,
        exercise: row.exercise,
        exerciseImageUrl: row.exercise_image_url,
        sourceExerciseId: row.source_exercise_id,
        reps: row.reps,
        loadKg: row.load_kg,
    }))
})
