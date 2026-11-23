import 'server-only'

import { Effect } from 'effect'
import type { LyftaSyncResult } from '@/_bff/core/constants/lyfta.constants'
import { createDBAdminClient } from '@/_bff/core/db'
import type { SyncOutcome, SyncTaskPayload } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { LogProps } from '@/_bff/lib/log-writer'
import { persistLog } from '@/_bff/lib/server-logger'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { finishLyftaSync } from '@/_bff/modules/lyfta/repositories/lyfta-connections.repository'

type FinishLyftaSyncDependencies = {
    createAdminClient: () => ReturnType<typeof createDBAdminClient>
    now: () => Date
    log?: (props: LogProps) => Promise<void>
}

const DEFAULT_DEPENDENCIES: FinishLyftaSyncDependencies = {
    createAdminClient: createDBAdminClient,
    now: () => new Date(),
}

// Records the outcome of the background run that holds the lease started at `payload.startedAt`.
export const finishLyftaSyncRun = Effect.fn('finishLyftaSyncRun')(function* (
    payload: SyncTaskPayload,
    outcome: SyncOutcome<LyftaSyncResult>,
    dependencies: FinishLyftaSyncDependencies = DEFAULT_DEPENDENCIES
) {
    const adminClient = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new CreateSbClientError({
                cause: 'Could not create the Lyfta connection database client',
                error_hash: ErrorCode.LYFTA_CLIENT,
            }),
    })
    // The sync summary carries more than the stored result (the checkpoint), which stays out of it.
    const stored: SyncOutcome<LyftaSyncResult> =
        outcome.status === 'succeeded'
            ? {
                  status: 'succeeded',
                  result: {
                      created: outcome.result.created,
                      updated: outcome.result.updated,
                      hasMore: outcome.result.hasMore,
                  },
              }
            : outcome
    const finishedAt = dependencies.now()
    yield* finishLyftaSync(
        adminClient,
        payload.userId,
        payload.startedAt,
        stored,
        finishedAt.toISOString()
    )
    if (stored.status !== 'succeeded') return

    const durationMs = finishedAt.getTime() - Date.parse(payload.startedAt)
    yield* Effect.tryPromise(() =>
        (dependencies.log ?? persistLog)({
            level: 'info',
            prefix: 'lyftaSync',
            message: 'Sync succeeded',
            userId: payload.userId,
            metadata: { ...stored.result, durationMs },
        })
    ).pipe(Effect.ignore)
})
