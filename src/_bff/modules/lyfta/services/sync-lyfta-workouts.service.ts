import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    LyftaCheckpointError,
    LyftaConnectionNotFoundError,
    LyftaResponseError,
    LyftaSyncInProgressError,
} from '@/_bff/lib/errors'
import {
    releaseLyftaSyncLease,
    selectLyftaConnection,
    takeLyftaSyncLease,
    updateLyftaLastSyncedAt,
} from '@/_bff/modules/lyfta/repositories/lyfta-connections.repository'
import type { LyftaWorkoutRange } from '@/_bff/modules/lyfta/types'
import { fetchLyftaWorkoutPage } from '@/_bff/modules/lyfta/services/lyfta-api.service'
import {
    DEFAULT_LYFTA_CONNECTION_DEPENDENCIES,
    decryptConnectionKey,
    type LyftaConnectionDependencies,
} from '@/_bff/modules/lyfta/services/lyfta-connection.service'
import {
    createLyftaImportContext,
    importLyftaWorkout,
    type LyftaImportContext,
} from '@/_bff/modules/training/services/import-lyfta-workout.service'
import {
    MAX_PAGES_PER_SYNC,
    SYNC_LEASE_STALE_MS,
    SYNC_TIME_BUDGET_MS,
} from '@/_bff/modules/lyfta/constants'
import {
    addUtcDays,
    getLyftaSyncStart,
    getLyftaSyncWindow,
} from '@/_bff/modules/lyfta/utils/sync-windows.utils'

type SyncDependencies = LyftaConnectionDependencies & {
    importWorkout: typeof importLyftaWorkout
    createImportContext: typeof createLyftaImportContext
    now: () => Date
}

const DEFAULT_DEPENDENCIES: SyncDependencies = {
    ...DEFAULT_LYFTA_CONNECTION_DEPENDENCIES,
    importWorkout: importLyftaWorkout,
    createImportContext: createLyftaImportContext,
    now: () => new Date(),
}

const syncStart = (lastSyncedAt: string | null, now: Date) =>
    Effect.try({
        try: () => getLyftaSyncStart(lastSyncedAt, now),
        catch: () =>
            new LyftaCheckpointError({
                cause: 'Could not calculate the Lyfta sync start date',
                error_hash: ErrorCode.LYFTA_CHECKPOINT,
            }),
    })

type SyncRun = {
    apiKey: string
    range: LyftaWorkoutRange
    context: LyftaImportContext
    // Pages this run may still fetch (shared by all windows of the run).
    pagesLeft: number
    startedAtMs: number
}

type WindowOutcome = { created: number; updated: number; pagesUsed: number; complete: boolean }

// Imports one window page by page. Incomplete (not checkpointed) when the time budget is spent or
// the page ceiling is reached before its last page. A workout already started is always finished.
const importWindow = Effect.fn('importLyftaWindow')(function* (
    user: User,
    run: SyncRun,
    dependencies: SyncDependencies
) {
    const outOfTime = () => dependencies.now().getTime() - run.startedAtMs >= SYNC_TIME_BUDGET_MS
    let pageNumber = 1
    let totalPages: number | null = null
    let created = 0
    let updated = 0
    const seenSourceIds = new Set<string>()

    while (totalPages === null || pageNumber <= totalPages) {
        if (pageNumber > run.pagesLeft || outOfTime()) {
            const stopped: WindowOutcome = {
                created,
                updated,
                pagesUsed: pageNumber - 1,
                complete: false,
            }
            return stopped
        }
        const page = yield* fetchLyftaWorkoutPage({
            apiKey: run.apiKey,
            page: pageNumber,
            range: run.range,
            fetcher: dependencies.fetcher,
        })

        if (totalPages === null) {
            totalPages = page.totalPages
        } else if (page.totalPages !== totalPages) {
            return yield* new LyftaResponseError({
                cause: 'Lyfta pagination changed during sync',
                error_hash: ErrorCode.LYFTA_API_RESPONSE,
            })
        }

        for (const workout of page.workouts) {
            if (outOfTime()) {
                const stopped: WindowOutcome = {
                    created,
                    updated,
                    pagesUsed: pageNumber,
                    complete: false,
                }
                return stopped
            }
            if (seenSourceIds.has(workout.sourceId)) {
                return yield* new LyftaResponseError({
                    cause: 'Lyfta returned a duplicate workout ID during pagination',
                    error_hash: ErrorCode.LYFTA_API_RESPONSE,
                })
            }
            seenSourceIds.add(workout.sourceId)

            const result = yield* dependencies.importWorkout(user, workout, run.context)
            if (result.created) created += 1
            else updated += 1
        }

        pageNumber += 1
    }

    const done: WindowOutcome = {
        created,
        updated,
        pagesUsed: Math.max(1, totalPages ?? 1),
        complete: true,
    }
    return done
})

// The checkpoint after a completed window: the last window ends the sync, so it is `now`; an
// earlier window ends at the start of its last day, so the next run starts there (its one-day
// overlap re-reads that day, which is harmless).
const checkpointAfter = (window: { to: string; isLast: boolean }, now: Date) =>
    window.isLast ? now.toISOString() : `${window.to}T00:00:00.000Z`

// Runs one sync. A lease on the connection row (compare-and-set, stale after SYNC_LEASE_STALE_MS)
// refuses an overlapping sync of the same athlete, which could otherwise duplicate strength sets.
// The lease is always released when the run ends, and a release failure never replaces the
// primary result. The history is read in ascending SYNC_WINDOW_DAYS windows and the checkpoint
// moves to the end of each fully completed window, so a stopped run resumes where it left off.
export const syncLyftaWorkouts = Effect.fn('syncLyftaWorkouts')(function* (
    user: User,
    dependencies: SyncDependencies = DEFAULT_DEPENDENCIES
) {
    const encryptionKey = dependencies.encryptionKey
    const adminClient = yield* Effect.try({
        try: dependencies.createAdminClient,
        catch: () =>
            new LyftaCheckpointError({
                cause: 'Could not create the Lyfta connection database client',
                error_hash: ErrorCode.LYFTA_CLIENT,
            }),
    })
    const connection = yield* selectLyftaConnection(adminClient, user.id)
    if (connection === null) {
        return yield* new LyftaConnectionNotFoundError({
            cause: 'No Lyfta connection exists for this user',
            error_hash: ErrorCode.LYFTA_NO_CONNECTION,
        })
    }

    const apiKey = yield* decryptConnectionKey(connection.encryptedApiKey, encryptionKey)
    const startedAt = dependencies.now()
    const startedAtIso = startedAt.toISOString()
    const staleBeforeIso = new Date(startedAt.getTime() - SYNC_LEASE_STALE_MS).toISOString()

    const leaseTaken = yield* takeLyftaSyncLease(adminClient, user.id, startedAtIso, staleBeforeIso)
    if (!leaseTaken) {
        return yield* new LyftaSyncInProgressError({
            cause: 'Another Lyfta sync of this athlete is running',
            error_hash: ErrorCode.LYFTA_SYNC_IN_PROGRESS,
        })
    }

    return yield* Effect.ensuring(
        Effect.gen(function* () {
            const today = startedAtIso.slice(0, 10)
            let from = yield* syncStart(connection.lastSyncedAt, startedAt)
            // The timezone and the user-bound client are resolved once for the whole run.
            const context = yield* dependencies.createImportContext(user)
            let pagesLeft = MAX_PAGES_PER_SYNC
            let created = 0
            let updated = 0
            let lastSyncedAt = connection.lastSyncedAt

            for (;;) {
                const window = getLyftaSyncWindow(from, today)
                const outcome = yield* importWindow(
                    user,
                    {
                        apiKey,
                        range: { from: window.from, to: window.to },
                        context,
                        pagesLeft,
                        startedAtMs: startedAt.getTime(),
                    },
                    dependencies
                )
                created += outcome.created
                updated += outcome.updated
                pagesLeft -= outcome.pagesUsed
                // An incomplete window is never checkpointed: the next run redoes it.
                if (!outcome.complete) return { created, updated, hasMore: true, lastSyncedAt }

                const checkpoint = yield* Effect.try({
                    try: () => checkpointAfter(window, dependencies.now()),
                    catch: () =>
                        new LyftaCheckpointError({
                            cause: 'Could not create the Lyfta sync timestamp',
                            error_hash: ErrorCode.LYFTA_CHECKPOINT,
                        }),
                })
                yield* updateLyftaLastSyncedAt(adminClient, user.id, checkpoint)
                lastSyncedAt = checkpoint
                if (window.isLast) return { created, updated, hasMore: false, lastSyncedAt }
                from = addUtcDays(window.to, 1)
            }
        }),
        releaseLyftaSyncLease(adminClient, user.id, startedAtIso).pipe(
            Effect.catch(() => Effect.void)
        )
    )
})
