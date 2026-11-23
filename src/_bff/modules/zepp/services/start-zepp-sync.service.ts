import 'server-only'

import { Effect } from 'effect'
import { SYNC_LEASE_STALE_MS } from '@/_bff/core/constants/sync.constants'
import { createDBAdminClient } from '@/_bff/core/db'
import { syncIdempotencyKey, type SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    CreateSbClientError,
    ZeppConnectionNotFoundError,
    ZeppSyncEnqueueError,
    ZeppSyncInProgressError,
} from '@/_bff/lib/errors'
import { triggerTask } from '@/_bff/lib/trigger-client'
import { ZEPP_SYNC_TASK_ID } from '@/_bff/modules/zepp/constants'
import {
    finishZeppSync,
    selectZeppConnection,
    setZeppSyncRunId,
    takeZeppSyncLease,
} from '@/_bff/modules/zepp/repositories/zepp-connections.repository'

type StartZeppSyncDependencies = {
    createAdminClient: () => ReturnType<typeof createDBAdminClient>
    triggerTask: typeof triggerTask
    now: () => Date
}

const DEFAULT_DEPENDENCIES: StartZeppSyncDependencies = {
    createAdminClient: createDBAdminClient,
    triggerTask,
    now: () => new Date(),
}

export const startZeppSync = Effect.fn('startZeppSync')(function* (
    userId: string,
    dependencies: StartZeppSyncDependencies = DEFAULT_DEPENDENCIES
) {
    const supabase = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new CreateSbClientError({
                cause: 'Could not create the Zepp connection database client',
                error_hash: ErrorCode.ZEPP_CLIENT,
            }),
    })
    const connection = yield* selectZeppConnection(supabase, userId)
    if (connection === null) {
        return yield* new ZeppConnectionNotFoundError({
            cause: 'No Zepp connection exists for this user',
            error_hash: ErrorCode.ZEPP_NO_CONNECTION,
        })
    }

    const now = dependencies.now()
    const startedAt = now.toISOString()
    const staleBefore = new Date(now.getTime() - SYNC_LEASE_STALE_MS).toISOString()
    const leaseTaken = yield* takeZeppSyncLease(supabase, userId, startedAt, staleBefore)
    if (!leaseTaken) {
        return yield* new ZeppSyncInProgressError({
            cause: 'A Zepp sync is already running for this user',
            error_hash: ErrorCode.ZEPP_SYNC_IN_PROGRESS,
        })
    }

    const payload: SyncTaskPayload = { userId, startedAt }
    const handle = yield* Effect.tryPromise({
        try: () =>
            dependencies.triggerTask(
                ZEPP_SYNC_TASK_ID,
                payload,
                syncIdempotencyKey('zepp', payload)
            ),
        catch: () =>
            new ZeppSyncEnqueueError({
                cause: 'Could not enqueue the Zepp sync task',
                error_hash: ErrorCode.ZEPP_SYNC_ENQUEUE,
            }),
    }).pipe(
        Effect.tapError((error) =>
            finishZeppSync(
                supabase,
                userId,
                startedAt,
                { status: 'failed', errorCode: error.error_hash },
                dependencies.now().toISOString()
            ).pipe(Effect.ignore)
        )
    )

    // The run ID only helps support find the run: the task is already enqueued, so a failed write
    // must not fail the start.
    yield* setZeppSyncRunId(supabase, userId, startedAt, handle.id).pipe(Effect.ignore)
    return { startedAt }
})
