import 'server-only'

import { Effect } from 'effect'
import { createDBAdminClient } from '@/_bff/core/db'
import { validTimezoneOrUtc } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { getAthleteTimezoneWithClient } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import type { TrainingClient } from '@/_bff/modules/training/types'

type ImportDependencies = {
    createClient: () => TrainingClient
    getTimezone: typeof getAthleteTimezoneWithClient
}

// What every activity of one sync shares, resolved once per sync instead of once per activity.
export type ImportContext = {
    supabase: TrainingClient
    timeZone: string
}

const DEFAULT_DEPENDENCIES: ImportDependencies = {
    createClient: createDBAdminClient,
    getTimezone: getAthleteTimezoneWithClient,
}

// Resolves the athlete timezone (UTC when the stored one is invalid) and creates the service-role
// client, once for a whole sync. Every query made with it filters by the user ID explicitly.
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
    const timeZone = validTimezoneOrUtc(yield* dependencies.getTimezone(supabase, userId))
    const context: ImportContext = { supabase, timeZone }
    return context
})
