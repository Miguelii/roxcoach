import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
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
    DETAIL_REQUEST_DELAY_MS,
    MAX_DETAILS_PER_SYNC,
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

type ZeppSyncResult = { imported: number; skipped: number; updated: number; remaining: number }

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

const newestFirst = (a: ZeppRunSummary, b: ZeppRunSummary) => Number(b.trackId) - Number(a.trackId)

// Imports the runs of the Zepp history that are not in Roxcoach yet, newest first, then adds the
// kilometre laps to runs imported before laps existed, at most MAX_DETAILS_PER_SYNC details per call
// in all. Safe to repeat: a run is fetched again only while it has no laps.
export const syncZeppActivities = Effect.fn('syncZeppActivities')(function* (
    user: User,
    dependencies: SyncDependencies = DEFAULT_SYNC_DEPENDENCIES
) {
    const admin = yield* createZeppAdminClient(dependencies)
    const connection = yield* selectZeppConnection(admin, user.id)
    if (connection === null)
        return yield* new ZeppConnectionNotFoundError({
            cause: 'No Zepp connection for this user',
            error_hash: ErrorCode.ZEPP_NO_CONNECTION,
        })

    const appToken = yield* decryptZeppConnectionToken(
        connection.encryptedAppToken,
        dependencies.encryptionKey
    )
    const { summaries } = yield* fetchZeppHistory(appToken, dependencies.api)
    const runs = summaries.filter((summary) => isImportableRun(summary)).toSorted(newestFirst)

    const context: ImportContext = yield* dependencies.createImportContext(user.id)
    const known = yield* dependencies.findKnownTrackIds(
        user.id,
        runs.map((run) => run.trackId),
        context
    )
    const unknown = runs.filter((run) => !known.has(run.trackId))
    // Decided before the batch is cut, so runs the athlete already has never use up its budget.
    const duplicates = yield* dependencies.findDuplicateTrackIds(
        user.id,
        unknown.map((run) => run.trackId),
        context
    )
    const fresh = unknown.filter((run) => !duplicates.has(run.trackId))
    const batch = fresh.slice(0, MAX_DETAILS_PER_SYNC)
    const withoutLaps = yield* dependencies.findRunsWithoutLaps(
        user.id,
        runs.filter((run) => known.has(run.trackId)).map((run) => run.trackId),
        context
    )
    const unsplit = runs.filter((run) => withoutLaps.has(run.trackId))
    const backfill = unsplit.slice(0, MAX_DETAILS_PER_SYNC - batch.length)

    let requests = 0
    // The history just answered, so a refused detail is about this run, not the session.
    const fetchDetail = (summary: ZeppRunSummary) =>
        Effect.gen(function* () {
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
        if (detail === null) {
            skipped += 1
            continue
        }
        const result = yield* dependencies.importActivity(
            user.id,
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
        if (detail === null || activityId === undefined) continue
        yield* dependencies.replaceRunLaps(
            user.id,
            activityId,
            buildZeppLaps(summary, detail),
            context
        )
        updated += 1
    }

    yield* updateZeppLastSyncedAt(admin, user.id, dependencies.now().toISOString())
    const result: ZeppSyncResult = {
        imported,
        skipped,
        updated,
        remaining: fresh.length - batch.length + unsplit.length - backfill.length,
    }
    return result
})
