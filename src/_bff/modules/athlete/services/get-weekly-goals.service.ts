import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { DEFAULT_WEEKLY_GOALS } from '@/_bff/core/constants/weekly-goals.constants'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import {
    selectWeeklyGoals,
    type GoalsClient,
} from '@/_bff/modules/athlete/repositories/weekly-goals.repository'

// For callers that already hold a client (the background task uses the service-role one).
// An athlete who never saved goals gets the defaults.
export const getWeeklyGoalsWithClient = Effect.fn('getWeeklyGoalsWithClient')(function* (
    supabase: GoalsClient,
    userId: string
) {
    return (yield* selectWeeklyGoals(supabase, userId)) ?? DEFAULT_WEEKLY_GOALS
})

// Runs as the signed-in user (publishable key).
export const getWeeklyGoals = Effect.fn('getWeeklyGoals')(function* (user: User) {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.ATHLETE_GOALS_SB_CLIENT }),
    })

    return yield* getWeeklyGoalsWithClient(supabase, user.id)
})
