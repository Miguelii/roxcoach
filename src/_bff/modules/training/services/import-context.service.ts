import 'server-only'

import { Effect } from 'effect'
import {
    DEFAULT_RUN_TYPE_RULES,
    type RunTypeRules,
} from '@/_bff/core/constants/weekly-goals.constants'
import { createDBAdminClient } from '@/_bff/core/db'
import { validTimezoneOrUtc } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { getWeeklyGoalsWithClient } from '@/_bff/modules/athlete/services/get-weekly-goals.service'
import { getAthleteTimezoneWithClient } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import type { TrainingClient } from '@/_bff/modules/training/types'

type ImportDependencies = {
    createClient: () => TrainingClient
    getTimezone: typeof getAthleteTimezoneWithClient
    getGoals: typeof getWeeklyGoalsWithClient
}

// What every activity of one sync shares, resolved once per sync instead of once per activity.
export type ImportContext = {
    supabase: TrainingClient
    timeZone: string
    runTypeRules: RunTypeRules
}

const DEFAULT_DEPENDENCIES: ImportDependencies = {
    createClient: createDBAdminClient,
    getTimezone: getAthleteTimezoneWithClient,
    getGoals: getWeeklyGoalsWithClient,
}

// Resolves the athlete timezone (UTC when the stored one is invalid) and run type rules, and
// creates the service-role client, once for a whole sync. Every query made with it filters by the
// user ID explicitly. A failed goals read falls back to the default rules: run types must never
// stop a sync (Lyfta imports strength only and does not even use them).
export const createImportContext = Effect.fn('createImportContext')(function* (
    userId: string,
    dependencies: ImportDependencies = DEFAULT_DEPENDENCIES
) {
    const supabase = yield* Effect.try({
        try: dependencies.createClient,
        catch: (cause) =>
            new CreateSbClientError({
                cause,
                error_hash: ErrorCode.TRAINING_SB_CLIENT,
            }),
    })
    const [storedTimeZone, runTypeRules] = yield* Effect.all(
        [
            dependencies.getTimezone(supabase, userId),
            dependencies.getGoals(supabase, userId).pipe(
                Effect.map((goals) => goals.runTypeRules),
                Effect.catch(() => Effect.succeed(DEFAULT_RUN_TYPE_RULES))
            ),
        ],
        { concurrency: 2 }
    )
    const context: ImportContext = {
        supabase,
        timeZone: validTimezoneOrUtc(storedTimeZone),
        runTypeRules,
    }
    return context
})
