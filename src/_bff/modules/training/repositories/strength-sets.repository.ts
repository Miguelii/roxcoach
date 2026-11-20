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

type ReturnedError = { code: string; message: string }

const TABLE = 'strength_sets'
const numeric = z
    .union([
        z.number(),
        z
            .string()
            .regex(/^-?\d+(?:\.\d+)?$/u)
            .transform(Number),
    ])
    .nullable()

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
                .from(TABLE)
                .select(
                    'exercise, exercise_index, exercise_image_url, source_exercise_id, set_index, reps, load_kg, rir, rpe'
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
    }))
})

export const deleteStrengthSets = Effect.fn('deleteStrengthSets')(function* (
    supabase: TrainingClient,
    userId: string,
    activityId: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.from(TABLE).delete().eq('user_id', userId).eq('activity_id', activityId),
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
    }))

    const { error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).insert(rows),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_STRENGTH_SETS_INSERT,
            }),
    })

    if (error) return yield* writeError(error, ErrorCode.TRAINING_STRENGTH_SETS_INSERT_ERR)
})
