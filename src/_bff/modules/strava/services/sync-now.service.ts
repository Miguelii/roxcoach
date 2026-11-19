import 'server-only'

import { Effect } from 'effect'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, StravaNotConnectedError } from '@/_bff/lib/errors'
import { selectConnection } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { enqueueSyncMissing } from '@/_bff/modules/strava/services/enqueue-strava-jobs.service'

// "Sync now": queues the sync-missing job for a connected user.
export const syncNow = Effect.fn('syncNow')(function* (userId: string) {
    const supabase = yield* Effect.tryPromise({
        try: async () => createDBAdminClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.STRAVA_SYNC_NOW_SB_CLIENT }),
    })

    const connection = yield* selectConnection(supabase, userId)
    if (connection === null)
        return yield* new StravaNotConnectedError({
            cause: 'no strava connection for user',
            error_hash: ErrorCode.STRAVA_SYNC_NOW_NOT_CONNECTED,
        })

    yield* enqueueSyncMissing(userId)
    return { queued: true }
})
