import 'server-only'

import { Effect } from 'effect'
import type { ZeppSyncResult } from '@/_bff/core/constants/zepp.constants'
import { createDBAdminClient } from '@/_bff/core/db'
import type { SyncOutcome, SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { LogProps } from '@/_bff/lib/log-writer'
import { persistLog } from '@/_bff/lib/server-logger'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { finishZeppSync } from '@/_bff/modules/zepp/repositories/zepp-connections.repository'

type FinishZeppSyncDependencies = {
    createAdminClient: () => ReturnType<typeof createDBAdminClient>
    now: () => Date
    log?: (props: LogProps) => Promise<void>
}

const DEFAULT_DEPENDENCIES: FinishZeppSyncDependencies = {
    createAdminClient: createDBAdminClient,
    now: () => new Date(),
}

// Records the outcome of the background run that holds the lease started at `payload.startedAt`.
export const finishZeppSyncRun = Effect.fn('finishZeppSyncRun')(function* (
    payload: SyncTaskPayload,
    outcome: SyncOutcome<ZeppSyncResult>,
    dependencies: FinishZeppSyncDependencies = DEFAULT_DEPENDENCIES
) {
    const adminClient = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new CreateSbClientError({
                cause: 'Could not create the Zepp connection database client',
                error_hash: ErrorCode.ZEPP_CLIENT,
            }),
    })
    const finishedAt = dependencies.now()
    yield* finishZeppSync(
        adminClient,
        payload.userId,
        payload.startedAt,
        outcome,
        finishedAt.toISOString()
    )
    if (outcome.status !== 'succeeded') return

    const durationMs = finishedAt.getTime() - Date.parse(payload.startedAt)
    yield* Effect.tryPromise(() =>
        (dependencies.log ?? persistLog)({
            level: 'info',
            prefix: 'zeppSync',
            message: 'Sync succeeded',
            userId: payload.userId,
            metadata: { ...outcome.result, durationMs },
        })
    ).pipe(Effect.ignore)
})
