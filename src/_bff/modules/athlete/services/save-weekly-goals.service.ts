import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import type { RunTypeRules, WeeklyGoals } from '@/_bff/core/constants/weekly-goals.constants'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, WeeklyGoalsValidationError } from '@/_bff/lib/errors'
import { validateWeeklyGoals } from '@/_bff/modules/athlete/helpers/weekly-goals-validation.helper'
import { upsertWeeklyGoals } from '@/_bff/modules/athlete/repositories/weekly-goals.repository'
import { getWeeklyGoalsWithClient } from '@/_bff/modules/athlete/services/get-weekly-goals.service'
import { reclassifyRuns } from '@/_bff/modules/training/services/reclassify-runs.service'

type SaveGoalsDeps = { reclassifyRuns: typeof reclassifyRuns }

const DEFAULT_DEPS: SaveGoalsDeps = { reclassifyRuns }

const sameRules = (a: RunTypeRules, b: RunTypeRules) =>
    a.shortRunMaxM === b.shortRunMaxM &&
    a.longRunMinM === b.longRunMinM &&
    a.fastPaceSPerKm === b.fastPaceSPerKm

// Runs as the signed-in user. Reclassifying is skipped when no threshold changed, since every run
// already carries the type of the current rules. It runs before the upsert: a failed reclassify
// leaves the stored rules unchanged, so the next save still sees the change and retries it.
export const saveWeeklyGoals = Effect.fn('saveWeeklyGoals')(function* (
    user: User,
    goals: WeeklyGoals,
    deps: SaveGoalsDeps = DEFAULT_DEPS
) {
    const validation = validateWeeklyGoals(goals)
    if (!validation.ok)
        return yield* new WeeklyGoalsValidationError({
            cause: validation.field,
            error_hash: ErrorCode.ATHLETE_GOALS_INVALID,
            field: validation.field,
        })

    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.ATHLETE_GOALS_SB_CLIENT }),
    })

    const previous = yield* getWeeklyGoalsWithClient(supabase, user.id)
    const reclassified = sameRules(previous.runTypeRules, goals.runTypeRules)
        ? 0
        : yield* deps.reclassifyRuns(supabase, user.id, goals.runTypeRules)

    yield* upsertWeeklyGoals(supabase, user.id, goals)

    return { goals, reclassified }
})
