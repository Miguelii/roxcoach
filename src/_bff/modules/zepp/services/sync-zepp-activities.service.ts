import 'server-only'

import { Effect } from 'effect'
import type { ZeppSyncResult } from '@/_bff/core/constants/zepp.constants'
import { ownsSyncLease } from '@/_bff/core/helpers/sync-state.helper'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ZeppConnectionNotFoundError } from '@/_bff/lib/errors'
import {
    createImportContext,
    type ImportContext,
} from '@/_bff/modules/training/services/import-context.service'
import {
    findKnownZeppTrackIds,
    findZeppDuplicateTrackIds,
    findZeppRunsWithoutLaps,
    importZeppActivity,
    replaceZeppLaps,
} from '@/_bff/modules/training/services/import-zepp-activity.service'
import {
    CONNECTION_RECHECK_EVERY,
    DETAIL_REQUEST_DELAY_MS,
    MAX_DETAILS_PER_SYNC,
    ZEPP_SYNC_HISTORY_DAYS,
    ZEPP_IMPORTED_SPORT_TYPES,
} from '@/_bff/modules/zepp/constants'
import {
    selectZeppConnection,
    updateZeppLastSyncedAt,
} from '@/_bff/modules/zepp/repositories/zepp-connections.repository'
import { fetchZeppDetail, fetchZeppHistory } from '@/_bff/modules/zepp/services/zepp-api.service'
import {
    createZeppAdminClient,
    DEFAULT_ZEPP_CONNECTION_DEPENDENCIES,
    decryptZeppConnectionToken,
    type ZeppConnectionDependencies,
} from '@/_bff/modules/zepp/services/zepp-connection.service'
import type { ZeppRunSummary } from '@/_bff/modules/zepp/types'
import { adaptZeppRun } from '@/_bff/modules/zepp/utils/adapter.utils'
import { buildZeppLaps } from '@/_bff/modules/zepp/utils/laps.utils'

type SyncDependencies = ZeppConnectionDependencies & {
    createImportContext: typeof createImportContext
    findKnownTrackIds: typeof findKnownZeppTrackIds
    findDuplicateTrackIds: typeof findZeppDuplicateTrackIds
    importActivity: typeof importZeppActivity
    findRunsWithoutLaps: typeof findZeppRunsWithoutLaps
    replaceRunLaps: typeof replaceZeppLaps
    sleep: (ms: number) => Promise<void>
    now: () => Date
}

const DAY_MS = 86_400_000

const STOP_SYNC = 'stop' as const

const DEFAULT_SYNC_DEPENDENCIES: SyncDependencies = {
    ...DEFAULT_ZEPP_CONNECTION_DEPENDENCIES,
    createImportContext,
    findKnownTrackIds: findKnownZeppTrackIds,
    findDuplicateTrackIds: findZeppDuplicateTrackIds,
    importActivity: importZeppActivity,
    findRunsWithoutLaps: findZeppRunsWithoutLaps,
    replaceRunLaps: replaceZeppLaps,
    sleep: (ms) =>
        new Promise((resolve) => {
            setTimeout(resolve, ms)
        }),
    now: () => new Date(),
}

const isImportableRun = (summary: ZeppRunSummary) =>
    ZEPP_IMPORTED_SPORT_TYPES.some((type) => type === summary.sportType) && summary.distanceM > 0

const isWithinHistory = (summary: ZeppRunSummary, oldestStartMs: number) =>
    Number(summary.trackId) * 1000 >= oldestStartMs

const newestFirst = (a: ZeppRunSummary, b: ZeppRunSummary) => Number(b.trackId) - Number(a.trackId)

// Imports the runs of the last ZEPP_SYNC_HISTORY_DAYS days of the Zepp history that are not in
// Roxcoach yet, newest first, then adds the kilometre laps to runs imported before laps existed, at
// most MAX_DETAILS_PER_SYNC details per call in all. Safe to repeat: a run is fetched again only
// while it has no laps. The caller holds the sync lease started at `startedAt`: a disconnected
// account, a replaced token or a lease taken over by a newer run stops the run quietly without a
// checkpoint, and the checkpoint only moves while the lease is still this run's.
export const syncZeppActivities = Effect.fn('syncZeppActivities')(function* (
    userId: string,
    startedAt: string,
    dependencies: SyncDependencies = DEFAULT_SYNC_DEPENDENCIES
) {
    const admin = yield* createZeppAdminClient(dependencies)
    const connection = yield* selectZeppConnection(admin, userId)
    if (connection === null)
        return yield* new ZeppConnectionNotFoundError({
            cause: 'No Zepp connection for this user',
            error_hash: ErrorCode.ZEPP_NO_CONNECTION,
        })
    if (!ownsSyncLease(connection.sync, startedAt)) {
        const nothing: ZeppSyncResult = { imported: 0, skipped: 0, updated: 0, remaining: 0 }
        return nothing
    }

    const appToken = yield* decryptZeppConnectionToken(
        connection.encryptedAppToken,
        dependencies.encryptionKey
    )
    const { summaries } = yield* fetchZeppHistory(appToken, dependencies.api)
    const oldestStartMs = dependencies.now().getTime() - ZEPP_SYNC_HISTORY_DAYS * DAY_MS
    const runs = summaries
        .filter((summary) => isImportableRun(summary) && isWithinHistory(summary, oldestStartMs))
        .toSorted(newestFirst)

    const context: ImportContext = yield* dependencies.createImportContext(userId)
    const known = yield* dependencies.findKnownTrackIds(
        userId,
        runs.map((run) => run.trackId),
        context
    )
    const unknown = runs.filter((run) => !known.has(run.trackId))
    // Decided before the batch is cut, so runs the athlete already has never use up its budget.
    const duplicates = yield* dependencies.findDuplicateTrackIds(
        userId,
        unknown.map((run) => run.trackId),
        context
    )
    const fresh = unknown.filter((run) => !duplicates.has(run.trackId))
    const batch = fresh.slice(0, MAX_DETAILS_PER_SYNC)
    const withoutLaps = yield* dependencies.findRunsWithoutLaps(
        userId,
        runs.filter((run) => known.has(run.trackId)).map((run) => run.trackId),
        context
    )
    const unsplit = runs.filter((run) => withoutLaps.has(run.trackId))
    const backfill = unsplit.slice(0, MAX_DETAILS_PER_SYNC - batch.length)

    let requests = 0
    let leaseLost = false
    // 'stop' means the run lost its lease and must stop; `null` means Zepp refused the
    // detail of this run. The history just answered, so a refusal is about the run, not the session.
    const fetchDetail = (summary: ZeppRunSummary) =>
        Effect.gen(function* () {
            if (leaseLost) return STOP_SYNC
            if (requests > 0 && requests % CONNECTION_RECHECK_EVERY === 0) {
                const current = yield* selectZeppConnection(admin, userId)
                if (current === null || !ownsSyncLease(current.sync, startedAt)) {
                    leaseLost = true
                    return STOP_SYNC
                }
            }
            if (requests > 0)
                yield* Effect.promise(() => dependencies.sleep(DETAIL_REQUEST_DELAY_MS))
            requests += 1
            return yield* fetchZeppDetail(appToken, summary, dependencies.api).pipe(
                Effect.catchTags({
                    ZeppSessionExpiredError: () => Effect.succeed(null),
                    ZeppApiResponseError: () => Effect.succeed(null),
                })
            )
        })

    let imported = 0
    let skipped = 0
    for (const summary of batch) {
        const detail = yield* fetchDetail(summary)
        if (detail === STOP_SYNC) break
        if (detail === null) {
            skipped += 1
            continue
        }
        const result = yield* dependencies.importActivity(
            userId,
            summary,
            adaptZeppRun(summary, detail),
            context
        )
        if (result.created) imported += 1
        else skipped += 1
    }

    let updated = 0
    for (const summary of backfill) {
        const activityId = withoutLaps.get(summary.trackId)
        const detail = yield* fetchDetail(summary)
        if (detail === STOP_SYNC) break
        if (detail === null || activityId === undefined) continue
        yield* dependencies.replaceRunLaps(
            userId,
            activityId,
            buildZeppLaps(summary, detail),
            context
        )
        updated += 1
    }

    // A checkpoint update that matches no row means the lease was lost at the very end: nothing is
    // left to write, so the run ends the same way.
    if (!leaseLost)
        yield* updateZeppLastSyncedAt(admin, userId, startedAt, dependencies.now().toISOString())
    const result: ZeppSyncResult = {
        imported,
        skipped,
        updated,
        remaining: fresh.length - batch.length + unsplit.length - backfill.length,
    }
    return result
})
