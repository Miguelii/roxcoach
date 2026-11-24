import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { SYNC_LEASE_STALE_MS } from '@/_bff/core/constants/sync.constants'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    CreateSbClientError,
    ZeppConnectionNotFoundError,
    ZeppSyncInProgressError,
} from '@/_bff/lib/errors'
import {
    releaseZeppClearLease,
    resetZeppCheckpoint,
    selectZeppConnection,
    takeZeppSyncLease,
} from '@/_bff/modules/zepp/repositories/zepp-connections.repository'
import {
    clearSourceActivities,
    countSourceActivities,
} from '@/_bff/modules/training/services/source-activities.service'

type ClearZeppDependencies = {
    createAdminClient: () => ReturnType<typeof createDBAdminClient>
    clearActivities: (user: User, source: 'zepp') => ReturnType<typeof clearSourceActivities>
    countActivities: (user: User, source: 'zepp') => ReturnType<typeof countSourceActivities>
    now: () => Date
}

const DEFAULT_DEPENDENCIES: ClearZeppDependencies = {
    createAdminClient: createDBAdminClient,
    clearActivities: clearSourceActivities,
    countActivities: countSourceActivities,
    now: () => new Date(),
}

// Deletes every imported Zepp activity and forgets the sync checkpoint (the connection stays).
// The checkpoint goes first: if the delete then fails, the next sync reimports, whereas the other
// order could leave the activities gone and a checkpoint that makes the next sync skip them.
export const clearZeppActivities = Effect.fn('clearZeppActivities')(function* (
    user: User,
    dependencies: ClearZeppDependencies = DEFAULT_DEPENDENCIES
) {
    const supabase = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new CreateSbClientError({
                cause: 'Could not create the Zepp connection database client',
                error_hash: ErrorCode.ZEPP_CLIENT,
            }),
    })
    const connection = yield* selectZeppConnection(supabase, user.id)
    if (connection === null) {
        return yield* new ZeppConnectionNotFoundError({
            cause: 'No Zepp connection exists for this user',
            error_hash: ErrorCode.ZEPP_NO_CONNECTION,
        })
    }

    const startedAt = dependencies.now()
    const startedAtIso = startedAt.toISOString()
    const staleBeforeIso = new Date(startedAt.getTime() - SYNC_LEASE_STALE_MS).toISOString()
    const leaseTaken = yield* takeZeppSyncLease(supabase, user.id, startedAtIso, staleBeforeIso)
    if (!leaseTaken) {
        return yield* new ZeppSyncInProgressError({
            cause: 'A Zepp sync is running, so its activities cannot be cleared',
            error_hash: ErrorCode.ZEPP_SYNC_IN_PROGRESS,
        })
    }

    // The lease stops a sync from starting while the activities go: without it a sync could read the
    // old checkpoint, lose its history to the delete and still advance the new checkpoint.
    const deleted = yield* Effect.gen(function* () {
        yield* resetZeppCheckpoint(supabase, user.id)
        return yield* dependencies.clearActivities(user, 'zepp')
    }).pipe(
        Effect.ensuring(releaseZeppClearLease(supabase, user.id, startedAtIso).pipe(Effect.ignore))
    )
    return { deleted }
})

export const getZeppActivityCount = Effect.fn('getZeppActivityCount')(function* (
    user: User,
    dependencies: Pick<ClearZeppDependencies, 'countActivities'> = DEFAULT_DEPENDENCIES
) {
    const count = yield* dependencies.countActivities(user, 'zepp')
    return { count }
})
