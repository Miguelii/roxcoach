import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { rangeBounds } from '@/_bff/core/utils/progress-range.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, type ProfileQueryError } from '@/_bff/lib/errors'
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import { buildStrengthProgress } from '@/_bff/modules/training/helpers/build-strength-progress.helper'
import { selectStrengthWorkoutsInRange } from '@/_bff/modules/training/repositories/activities.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'

type StrengthProgressDeps = {
    createClient: () => Effect.Effect<TrainingClient, CreateSbClientError>
    getTimezone: (user: User) => Effect.Effect<string, ProfileQueryError | CreateSbClientError>
    now: () => Date
}

const defaultDeps: StrengthProgressDeps = {
    createClient: () =>
        Effect.tryPromise({
            try: () => createDBServerClient(),
            catch: (cause) =>
                new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
        }),
    getTimezone: getAthleteTimezone,
    now: () => new Date(),
}

// Runs as the signed-in user (publishable key). An empty history yields empty series.
export const getStrengthProgress = Effect.fn('getStrengthProgress')(function* (
    user: User,
    range: ProgressRange,
    deps: StrengthProgressDeps = defaultDeps
) {
    const supabase = yield* deps.createClient()
    const timezone = yield* deps.getTimezone(user)
    const today = todayIn(timezone, deps.now())
    const { from } = rangeBounds(today, range)

    const workouts = yield* selectStrengthWorkoutsInRange(supabase, user.id, from, today)

    return buildStrengthProgress({
        range,
        today,
        workouts,
        sets: workouts.flatMap((workout) => workout.sets),
    })
})
