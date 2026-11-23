import 'server-only'

import { Effect } from 'effect'
import { SYNC_LEASE_STALE_MS } from '@/_bff/core/constants/sync.constants'
import { createDBAdminClient } from '@/_bff/core/db'
import { syncIdempotencyKey, type SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    CreateSbClientError,
    LyftaConnectionNotFoundError,
    LyftaSyncEnqueueError,
    LyftaSyncInProgressError,
} from '@/_bff/lib/errors'
import { triggerTask } from '@/_bff/lib/trigger-client'
import { LYFTA_SYNC_TASK_ID } from '@/_bff/modules/lyfta/constants'
import {
    finishLyftaSync,
    selectLyftaConnection,
    setLyftaSyncRunId,
    takeLyftaSyncLease,
} from '@/_bff/modules/lyfta/repositories/lyfta-connections.repository'

type StartLyftaSyncDependencies = {
    createAdminClient: () => ReturnType<typeof createDBAdminClient>
    triggerTask: typeof triggerTask
    now: () => Date
}

const DEFAULT_DEPENDENCIES: StartLyftaSyncDependencies = {
    createAdminClient: createDBAdminClient,
    triggerTask,
    now: () => new Date(),
}

export const startLyftaSync = Effect.fn('startLyftaSync')(function* (
    userId: string,
    dependencies: StartLyftaSyncDependencies = DEFAULT_DEPENDENCIES
) {
    const supabase = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new CreateSbClientError({
                cause: 'Could not create the Lyfta connection database client',
                error_hash: ErrorCode.LYFTA_CLIENT,
            }),
    })
    const connection = yield* selectLyftaConnection(supabase, userId)
    if (connection === null) {
        return yield* new LyftaConnectionNotFoundError({
            cause: 'No Lyfta connection exists for this user',
            error_hash: ErrorCode.LYFTA_NO_CONNECTION,
        })
    }

    const now = dependencies.now()
    const startedAt = now.toISOString()
    const staleBefore = new Date(now.getTime() - SYNC_LEASE_STALE_MS).toISOString()
    const leaseTaken = yield* takeLyftaSyncLease(supabase, userId, startedAt, staleBefore)
    if (!leaseTaken) {
        return yield* new LyftaSyncInProgressError({
            cause: 'A Lyfta sync is already running for this user',
            error_hash: ErrorCode.LYFTA_SYNC_IN_PROGRESS,
        })
    }

    const payload: SyncTaskPayload = { userId, startedAt }
    const handle = yield* Effect.tryPromise({
        try: () =>
            dependencies.triggerTask(
                LYFTA_SYNC_TASK_ID,
                payload,
                syncIdempotencyKey('lyfta', payload)
            ),
        catch: () =>
            new LyftaSyncEnqueueError({
                cause: 'Could not enqueue the Lyfta sync task',
                error_hash: ErrorCode.LYFTA_SYNC_ENQUEUE,
            }),
    }).pipe(
        Effect.tapError((error) =>
            finishLyftaSync(
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
    yield* setLyftaSyncRunId(supabase, userId, startedAt, handle.id).pipe(Effect.ignore)
    return { startedAt }
})
