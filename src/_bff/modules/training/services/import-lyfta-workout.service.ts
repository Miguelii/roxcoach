import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { localDateIn, validTimezoneOrUtc } from '@/_bff/core/utils/date.utils'
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

type ImportDependencies = {
    createUserClient: () => Promise<TrainingClient>
    getTimezone: typeof getAthleteTimezone
}

// What every workout of one sync shares, resolved once per sync instead of once per workout.
export type LyftaImportContext = {
    supabase: TrainingClient
    timeZone: string
}

const DEFAULT_DEPENDENCIES: ImportDependencies = {
    createUserClient: createDBServerClient,
    getTimezone: getAthleteTimezone,
}

// Resolves the athlete timezone (UTC when the stored one is invalid) and creates the session-bound
// client, once for a whole sync.
export const createLyftaImportContext = Effect.fn('createLyftaImportContext')(function* (
    user: User,
    dependencies: ImportDependencies = DEFAULT_DEPENDENCIES
) {
    const timeZone = validTimezoneOrUtc(yield* dependencies.getTimezone(user))
    const supabase = yield* Effect.tryPromise({
        try: dependencies.createUserClient,
        catch: (cause) =>
            new CreateSbClientError({
                cause,
                error_hash: ErrorCode.TRAINING_SB_CLIENT,
            }),
    })
    const context: LyftaImportContext = { supabase, timeZone }
    return context
})

export const importLyftaWorkout = Effect.fn('importLyftaWorkout')(function* (
    user: User,
    workout: LyftaWorkout,
    context: LyftaImportContext
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
