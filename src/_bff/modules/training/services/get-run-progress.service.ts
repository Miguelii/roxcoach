import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { zoneBoundsBpm } from '@/_bff/core/constants/hr-zones.constants'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { RACE_READINESS } from '@/_bff/core/constants/race-readiness.constants'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { addDays } from '@/_bff/core/utils/week-dates.utils'
import { rangeBounds } from '@/_bff/core/utils/progress-range.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, type ProfileQueryError, type RaceQueryError } from '@/_bff/lib/errors'
import { getProfile } from '@/_bff/modules/athlete/services/get-profile.service'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import { listRaces } from '@/_bff/modules/races/services/list-races.service'
import type { RaceDTO, RaceFilter } from '@/_bff/modules/races/types'
import { buildRunProgress } from '@/_bff/modules/training/helpers/build-run-progress.helper'
import { pickGoalRace } from '@/_bff/modules/training/helpers/pick-goal-race.helper'
import { pickNextRace } from '@/_bff/modules/training/helpers/pick-next-race.helper'
import { selectRunsInRange } from '@/_bff/modules/training/repositories/activities.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'

type RunProgressDeps = {
    createClient: () => Effect.Effect<TrainingClient, CreateSbClientError>
    getProfile: (user: User) => Effect.Effect<ProfileDTO, ProfileQueryError | CreateSbClientError>
    listRaces: (
        user: User,
        filter: RaceFilter
    ) => Effect.Effect<RaceDTO[], RaceQueryError | CreateSbClientError>
    now: () => Date
}

const defaultDeps: RunProgressDeps = {
    createClient: () =>
        Effect.tryPromise({
            try: () => createDBServerClient(),
            catch: (cause) =>
                new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
        }),
    getProfile,
    listRaces,
    now: () => new Date(),
}

// Runs as the signed-in user (publishable key). An empty history yields empty series.
export const getRunProgress = Effect.fn('getRunProgress')(function* (
    user: User,
    range: ProgressRange,
    deps: RunProgressDeps = defaultDeps
) {
    const supabase = yield* deps.createClient()
    const profile = yield* deps.getProfile(user)
    const today = todayIn(profile.timezone, deps.now())
    const { from } = rangeBounds(today, range)

    const [runs, races] = yield* Effect.all(
        [
            selectRunsInRange(
                supabase,
                user.id,
                from,
                today,
                addDays(today, -(RACE_READINESS.WINDOW_DAYS - 1))
            ),
            deps.listRaces(user, { status: ['upcoming'] }),
        ],
        { concurrency: 2 }
    )

    return buildRunProgress({
        runs,
        today,
        range,
        zoneBounds: zoneBoundsBpm({ maxHr: profile.maxHr, restingHr: profile.restingHr }),
        goalRace: pickGoalRace(races),
        nextRace: pickNextRace(races),
    })
})
