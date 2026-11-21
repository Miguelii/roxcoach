import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { localDateIn } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LyftaImportError } from '@/_bff/lib/errors'
import { upsertLyftaActivity } from '@/_bff/modules/training/repositories/activities.repository'
import {
    deleteStrengthSets,
    insertStrengthSets,
} from '@/_bff/modules/training/repositories/strength-sets.repository'
import type { ImportContext } from '@/_bff/modules/training/services/import-context.service'
import type { LyftaWorkout } from '@/_bff/modules/lyfta/types'

export const importLyftaWorkout = Effect.fn('importLyftaWorkout')(function* (
    user: User,
    workout: LyftaWorkout,
    context: ImportContext
) {
    const { supabase, timeZone } = context
    const localDate = yield* Effect.try({
        try: () => localDateIn(workout.startedAt, timeZone),
        catch: () =>
            new LyftaImportError({
                cause: 'Could not calculate the athlete-local workout date',
                error_hash: ErrorCode.LYFTA_WORKOUT_PARSE,
            }),
    })

    const activity = yield* upsertLyftaActivity(supabase, user.id, {
        source_id: workout.sourceId,
        category: 'strength',
        sport_type: 'strength',
        name: workout.title,
        started_at: workout.startedAt,
        local_date: localDate,
        elapsed_time_s: workout.durationSeconds,
        body_weight_kg: workout.bodyWeightKg,
        lyfta_total_volume_kg_reps: workout.totalVolumeKgReps,
    })

    const sets = workout.exercises.flatMap((exercise, exerciseIndex) =>
        exercise.sets.map((set) => ({
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

    yield* deleteStrengthSets(supabase, user.id, activity.activityId)
    yield* insertStrengthSets(supabase, user.id, activity.activityId, sets)

    return activity
})
