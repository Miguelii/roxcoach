import 'server-only'

import { Effect } from 'effect'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { selectDisplayNames } from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'

type DisplayNamesDependencies = {
    createAdminClient: () => ReturnType<typeof createDBAdminClient>
}

const DEFAULT_DEPENDENCIES: DisplayNamesDependencies = { createAdminClient: createDBAdminClient }

// Names of other athletes, for the logs page: read with the service-role client, one query.
export const getAthleteDisplayNames = Effect.fn('getAthleteDisplayNames')(function* (
    userIds: string[],
    dependencies: DisplayNamesDependencies = DEFAULT_DEPENDENCIES
) {
    if (userIds.length === 0) return new Map<string, string>()

    const supabase = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.ATHLETE_SB_CLIENT }),
    })
    return yield* selectDisplayNames(supabase, userIds)
})
