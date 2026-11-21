import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { validTimezoneOrUtc } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import type { TrainingClient } from '@/_bff/modules/training/types'

type ImportDependencies = {
    createUserClient: () => Promise<TrainingClient>
    getTimezone: typeof getAthleteTimezone
}

// What every activity of one sync shares, resolved once per sync instead of once per activity.
export type ImportContext = {
    supabase: TrainingClient
    timeZone: string
}

const DEFAULT_DEPENDENCIES: ImportDependencies = {
    createUserClient: createDBServerClient,
    getTimezone: getAthleteTimezone,
}

// Resolves the athlete timezone (UTC when the stored one is invalid) and creates the session-bound
// client, once for a whole sync.
export const createImportContext = Effect.fn('createImportContext')(function* (
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
    const context: ImportContext = { supabase, timeZone }
    return context
})
