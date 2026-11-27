import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import type { RunType, RunTypeRules } from '@/_bff/core/constants/weekly-goals.constants'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    ActivityNotFoundError,
    CreateSbClientError,
    type WeeklyGoalsQueryError,
} from '@/_bff/lib/errors'
import { getWeeklyGoals } from '@/_bff/modules/athlete/services/get-weekly-goals.service'
import { classifyRun } from '@/_bff/modules/training/helpers/classify-run.helper'
import {
    selectActivityById,
    setActivityRunType,
} from '@/_bff/modules/training/repositories/activities.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'

type SetRunTypeInput = { activityId: string; runType: 'long' | 'fast' | 'none' | 'auto' }

type SetRunTypeDeps = {
    createClient: () => Effect.Effect<TrainingClient, CreateSbClientError>
    getRunTypeRules: (
        user: User
    ) => Effect.Effect<RunTypeRules, WeeklyGoalsQueryError | CreateSbClientError>
}

const defaultDeps: SetRunTypeDeps = {
    createClient: () =>
        Effect.tryPromise({
            try: () => createDBServerClient(),
            catch: (cause) =>
                new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
        }),
    getRunTypeRules: (user) => getWeeklyGoals(user).pipe(Effect.map((goals) => goals.runTypeRules)),
}

const notFound = () =>
    new ActivityNotFoundError({
        cause: 'no live run of the user has that id',
        error_hash: ErrorCode.TRAINING_RUN_TYPE_NOT_FOUND,
    })

// Runs as the signed-in user (publishable key). 'auto' hands the run back to the rules.
export const setRunType = Effect.fn('setRunType')(function* (
    user: User,
    input: SetRunTypeInput,
    deps: SetRunTypeDeps = defaultDeps
) {
    const supabase = yield* deps.createClient()

    let runType: RunType | null
    if (input.runType === 'auto') {
        const [activity, rules] = yield* Effect.all(
            [selectActivityById(supabase, user.id, input.activityId), deps.getRunTypeRules(user)],
            { concurrency: 2 }
        )
        if (activity === null || activity.category !== 'run') return yield* notFound()
        runType = classifyRun(activity, rules)
    } else {
        runType = input.runType === 'none' ? null : input.runType
    }

    const manual = input.runType !== 'auto'
    const matched = yield* setActivityRunType(supabase, user.id, input.activityId, {
        runType,
        manual,
    })
    if (!matched) return yield* notFound()

    return { runType, runTypeManual: manual }
})
