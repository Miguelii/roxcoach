import 'server-only'

import { Effect } from 'effect'
import { localDateIn } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LyftaImportError } from '@/_bff/lib/errors'
import {
    selectSourceIds,
    upsertLyftaActivities,
} from '@/_bff/modules/training/repositories/activities.repository'
import {
    deleteStrengthSets,
    insertStrengthSets,
} from '@/_bff/modules/training/repositories/strength-sets.repository'
import type { ImportContext } from '@/_bff/modules/training/services/import-context.service'
import type { LyftaWorkout } from '@/_bff/modules/lyfta/types'

const toActivityRow = (workout: LyftaWorkout, timeZone: string) =>
    Effect.try({
        try: () => ({
            source_id: workout.sourceId,
            category: 'strength' as const,
            sport_type: 'strength' as const,
            name: workout.title,
            started_at: workout.startedAt,
            local_date: localDateIn(workout.startedAt, timeZone),
            elapsed_time_s: workout.durationSeconds,
            body_weight_kg: workout.bodyWeightKg,
            lyfta_total_volume_kg_reps: workout.totalVolumeKgReps,
        }),
        catch: () =>
            new LyftaImportError({
                cause: 'Could not calculate the athlete-local workout date',
                error_hash: ErrorCode.LYFTA_WORKOUT_PARSE,
            }),
    })

const toSetRows = (workout: LyftaWorkout, activityId: string) =>
    workout.exercises.flatMap((exercise, exerciseIndex) =>
        exercise.sets.map((set) => ({
            activity_id: activityId,
            exercise: exercise.name,
            exercise_index: exerciseIndex + 1,
            exercise_image_url: exercise.imageUrl,
            source_exercise_id: exercise.exerciseId,
            set_index: set.setIndex,
            reps: set.reps,
            load_kg: set.loadKg,
            rir: set.rir,
            rpe: null,
            lyfta_records: set.records ?? null,
        }))
    )

// Imports a page of workouts in four statements, whatever its size: which source ids exist (for the
// created count), one upsert of the activities, one delete and one insert of all their sets.
export const importLyftaWorkouts = Effect.fn('importLyftaWorkouts')(function* (
    userId: string,
    workouts: LyftaWorkout[],
    context: ImportContext
) {
    const { supabase, timeZone } = context
    if (workouts.length === 0) return { created: 0, updated: 0 }

    const rows = yield* Effect.forEach(workouts, (workout) => toActivityRow(workout, timeZone))

    const existing = yield* selectSourceIds(
        supabase,
        userId,
        'lyfta',
        workouts.map((workout) => workout.sourceId)
    )
    const activityIds = yield* upsertLyftaActivities(supabase, userId, rows)

    const ids = [...activityIds.values()]
    yield* deleteStrengthSets(supabase, userId, ids)
    yield* insertStrengthSets(
        supabase,
        userId,
        workouts.flatMap((workout) => toSetRows(workout, activityIds.get(workout.sourceId) ?? ''))
    )

    const created = workouts.filter((workout) => !existing.has(workout.sourceId)).length
    return { created, updated: workouts.length - created }
})
