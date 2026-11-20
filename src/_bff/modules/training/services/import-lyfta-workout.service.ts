import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, LyftaImportError } from '@/_bff/lib/errors'
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import { upsertLyftaActivity } from '@/_bff/modules/training/repositories/activities.repository'
import {
    deleteStrengthSets,
    insertStrengthSets,
} from '@/_bff/modules/training/repositories/strength-sets.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'
import type { LyftaWorkout } from '@/_bff/modules/lyfta/types'
import { toLocalDate } from '@/_bff/modules/lyfta/utils/workouts.utils'

type ImportDependencies = {
    createUserClient: () => Promise<TrainingClient>
    getTimezone: typeof getAthleteTimezone
}

const DEFAULT_DEPENDENCIES: ImportDependencies = {
    createUserClient: createDBServerClient,
    getTimezone: getAthleteTimezone,
}

export const importLyftaWorkout = Effect.fn('importLyftaWorkout')(function* (
    user: User,
    workout: LyftaWorkout,
    dependencies: ImportDependencies = DEFAULT_DEPENDENCIES
) {
    const timeZone = yield* dependencies.getTimezone(user)
    const localDate = yield* Effect.try({
        try: () => toLocalDate(workout.startedAt, timeZone),
        catch: () =>
            new LyftaImportError({
                cause: 'Could not calculate the athlete-local workout date',
                error_hash: ErrorCode.LYFTA_WORKOUT_PARSE,
            }),
    })
    const supabase = yield* Effect.tryPromise({
        try: dependencies.createUserClient,
        catch: (cause) =>
            new CreateSbClientError({
                cause,
                error_hash: ErrorCode.TRAINING_SB_CLIENT,
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

    const sets = workout.exercises.flatMap((exercise) =>
        exercise.sets.map((set) => ({
            exercise: exercise.name,
            source_exercise_id: exercise.exerciseId,
            set_index: set.setIndex,
            reps: set.reps,
            load_kg: set.loadKg,
            rir: set.rir,
            rpe: null,
        }))
    )

    yield* deleteStrengthSets(supabase, user.id, activity.activityId)
    yield* insertStrengthSets(supabase, user.id, activity.activityId, sets)

    return activity
})
