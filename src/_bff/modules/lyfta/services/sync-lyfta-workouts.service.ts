import 'server-only'

import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    LyftaCheckpointError,
    LyftaConnectionNotFoundError,
    LyftaResponseError,
} from '@/_bff/lib/errors'
import {
    selectLyftaConnection,
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
    createImportContext,
    type ImportContext,
} from '@/_bff/modules/training/services/import-context.service'
import { importLyftaWorkout } from '@/_bff/modules/training/services/import-lyfta-workout.service'
import { MAX_PAGES_PER_SYNC } from '@/_bff/modules/lyfta/constants'
import type { LyftaSyncResult } from '@/_bff/core/constants/lyfta.constants'
import {
    addUtcDays,
    getLyftaSyncStart,
    getLyftaSyncWindow,
} from '@/_bff/modules/lyfta/utils/sync-windows.utils'

type SyncDependencies = LyftaConnectionDependencies & {
    importWorkout: typeof importLyftaWorkout
    createImportContext: typeof createImportContext
    now: () => Date
}

type SyncRun = {
    apiKey: string
    range: LyftaWorkoutRange
    context: ImportContext
    // Pages this run may still fetch (shared by all windows of the run).
    pagesLeft: number
}

type WindowOutcome = { created: number; updated: number; pagesUsed: number; complete: boolean }

type SyncSummary = LyftaSyncResult & { lastSyncedAt: string | null }

const DEFAULT_DEPENDENCIES: SyncDependencies = {
    ...DEFAULT_LYFTA_CONNECTION_DEPENDENCIES,
    importWorkout: importLyftaWorkout,
    createImportContext,
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

// Imports one window page by page. Incomplete (not checkpointed) when the page ceiling is reached
// before its last page.
const importWindow = Effect.fn('importLyftaWindow')(function* (
    userId: string,
    run: SyncRun,
    dependencies: SyncDependencies
) {
    let pageNumber = 1
    let totalPages: number | null = null
    let created = 0
    let updated = 0
    const seenSourceIds = new Set<string>()

    while (totalPages === null || pageNumber <= totalPages) {
        if (pageNumber > run.pagesLeft) {
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
            if (seenSourceIds.has(workout.sourceId)) {
                return yield* new LyftaResponseError({
                    cause: 'Lyfta returned a duplicate workout ID during pagination',
                    error_hash: ErrorCode.LYFTA_API_RESPONSE,
                })
            }
            seenSourceIds.add(workout.sourceId)

            const result = yield* dependencies.importWorkout(userId, workout, run.context)
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

// Runs one sync. The caller holds the sync lease (taken by the start service), which keeps two
// syncs of the same athlete from duplicating strength sets. The history is read in ascending
// SYNC_WINDOW_DAYS windows and the checkpoint moves to the end of each fully completed window, so a
// stopped run resumes where it left off. The connection is re-read before every later window: a
// disconnect (or account deletion) during the run ends it quietly with what was imported so far.
export const syncLyftaWorkouts = Effect.fn('syncLyftaWorkouts')(function* (
    userId: string,
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
    const connection = yield* selectLyftaConnection(adminClient, userId)
    if (connection === null) {
        return yield* new LyftaConnectionNotFoundError({
            cause: 'No Lyfta connection exists for this user',
            error_hash: ErrorCode.LYFTA_NO_CONNECTION,
        })
    }

    const apiKey = yield* decryptConnectionKey(connection.encryptedApiKey, encryptionKey)
    const startedAt = dependencies.now()
    const today = startedAt.toISOString().slice(0, 10)
    let from = yield* syncStart(connection.lastSyncedAt, startedAt)
    // The timezone and the service-role client are resolved once for the whole run.
    const context = yield* dependencies.createImportContext(userId)
    let pagesLeft = MAX_PAGES_PER_SYNC
    let created = 0
    let updated = 0
    let lastSyncedAt = connection.lastSyncedAt
    let firstWindow = true

    for (;;) {
        if (!firstWindow && (yield* selectLyftaConnection(adminClient, userId)) === null) {
            const stopped: SyncSummary = { created, updated, hasMore: false, lastSyncedAt }
            return stopped
        }
        firstWindow = false

        const window = getLyftaSyncWindow(from, today)
        const outcome = yield* importWindow(
            userId,
            { apiKey, range: { from: window.from, to: window.to }, context, pagesLeft },
            dependencies
        )
        created += outcome.created
        updated += outcome.updated
        pagesLeft -= outcome.pagesUsed
        // An incomplete window is never checkpointed: the next run redoes it.
        if (!outcome.complete) {
            const capped: SyncSummary = { created, updated, hasMore: true, lastSyncedAt }
            return capped
        }

        const checkpoint = yield* Effect.try({
            try: () => checkpointAfter(window, dependencies.now()),
            catch: () =>
                new LyftaCheckpointError({
                    cause: 'Could not create the Lyfta sync timestamp',
                    error_hash: ErrorCode.LYFTA_CHECKPOINT,
                }),
        })
        yield* updateLyftaLastSyncedAt(adminClient, userId, checkpoint)
        lastSyncedAt = checkpoint
        if (window.isLast) {
            const done: SyncSummary = { created, updated, hasMore: false, lastSyncedAt }
            return done
        }
        from = addUtcDays(window.to, 1)
    }
})
