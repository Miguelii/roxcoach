import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { lyftaSyncResultSchema } from '@/_bff/core/constants/lyfta.constants'
import { createDBAdminClient } from '@/_bff/core/db'
import { toSyncState } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    CreateSbClientError,
    LyftaConnectionNotFoundError,
    LyftaSyncInProgressError,
} from '@/_bff/lib/errors'
import {
    resetLyftaCheckpoint,
    selectLyftaConnection,
} from '@/_bff/modules/lyfta/repositories/lyfta-connections.repository'
import {
    clearSourceActivities,
    countSourceActivities,
} from '@/_bff/modules/training/services/source-activities.service'

type ClearLyftaDependencies = {
    createAdminClient: () => ReturnType<typeof createDBAdminClient>
    clearActivities: (user: User, source: 'lyfta') => ReturnType<typeof clearSourceActivities>
    countActivities: (user: User, source: 'lyfta') => ReturnType<typeof countSourceActivities>
    now: () => Date
}

const DEFAULT_DEPENDENCIES: ClearLyftaDependencies = {
    createAdminClient: createDBAdminClient,
    clearActivities: clearSourceActivities,
    countActivities: countSourceActivities,
    now: () => new Date(),
}

// Deletes every imported Lyfta activity and forgets the sync checkpoint (the connection stays).
// The checkpoint goes first: if the delete then fails, the next sync reimports, whereas the other
// order could leave the activities gone and a checkpoint that makes the next sync skip them.
export const clearLyftaActivities = Effect.fn('clearLyftaActivities')(function* (
    user: User,
    dependencies: ClearLyftaDependencies = DEFAULT_DEPENDENCIES
) {
    const supabase = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new CreateSbClientError({
                cause: 'Could not create the Lyfta connection database client',
                error_hash: ErrorCode.LYFTA_CLIENT,
            }),
    })
    const connection = yield* selectLyftaConnection(supabase, user.id)
    if (connection === null) {
        return yield* new LyftaConnectionNotFoundError({
            cause: 'No Lyfta connection exists for this user',
            error_hash: ErrorCode.LYFTA_NO_CONNECTION,
        })
    }

    const sync = toSyncState(
        connection.sync,
        lyftaSyncResultSchema,
        ErrorCode.LYFTA_SYNC_FAILED,
        dependencies.now()
    )
    if (sync.status === 'running') {
        return yield* new LyftaSyncInProgressError({
            cause: 'A Lyfta sync is running, so its activities cannot be cleared',
            error_hash: ErrorCode.LYFTA_SYNC_IN_PROGRESS,
        })
    }

    yield* resetLyftaCheckpoint(supabase, user.id)
    const deleted = yield* dependencies.clearActivities(user, 'lyfta')
    return { deleted }
})

export const getLyftaActivityCount = Effect.fn('getLyftaActivityCount')(function* (
    user: User,
    dependencies: Pick<ClearLyftaDependencies, 'countActivities'> = DEFAULT_DEPENDENCIES
) {
    const count = yield* dependencies.countActivities(user, 'lyfta')
    return { count }
})
