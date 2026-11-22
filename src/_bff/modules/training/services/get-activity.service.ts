import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { STRENGTH_COMPARISON_HISTORY } from '@/_bff/core/constants/progress.constants'
import { buildStrengthComparison } from '@/_bff/modules/training/helpers/build-strength-comparison.helper'
import {
    selectActivityById,
    selectStrengthWorkoutsBefore,
} from '@/_bff/modules/training/repositories/activities.repository'
import { selectLaps } from '@/_bff/modules/training/repositories/activity-laps.repository'
import {
    selectSetsForActivities,
    selectStrengthSets,
} from '@/_bff/modules/training/repositories/strength-sets.repository'
import type { ExerciseComparisonDTO } from '@/_bff/modules/training/types'

// Runs as the signed-in user (publishable key). Returns null when the activity does not exist, is
// soft-deleted or belongs to someone else.
// The activity, its laps and its sets are read in one parallel round-trip: laps and sets are
// filtered by `user_id` too, so reading them before the activity is confirmed leaks nothing, and on
// a miss they are simply discarded.
export const getActivity = Effect.fn('getActivity')(function* (user: User, id: string) {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
    })

    const [activity, laps, strengthSets] = yield* Effect.all(
        [
            selectActivityById(supabase, user.id, id),
            selectLaps(supabase, user.id, id),
            selectStrengthSets(supabase, user.id, id),
        ],
        { concurrency: 3 }
    )
    if (activity === null) return null

    // A strength workout is compared with the athlete's earlier ones, exercise by exercise.
    let strengthComparisons: ExerciseComparisonDTO[] = []
    if (activity.category === 'strength' && strengthSets.length > 0) {
        const history = yield* selectStrengthWorkoutsBefore(
            supabase,
            user.id,
            activity.startedAt,
            STRENGTH_COMPARISON_HISTORY
        )
        const historySets =
            history.length === 0
                ? []
                : yield* selectSetsForActivities(
                      supabase,
                      user.id,
                      history.map((workout) => workout.activityId)
                  )
        strengthComparisons = buildStrengthComparison({
            current: strengthSets,
            history,
            sets: historySets,
        })
    }

    return { activity, laps, strengthSets, strengthComparisons }
})
