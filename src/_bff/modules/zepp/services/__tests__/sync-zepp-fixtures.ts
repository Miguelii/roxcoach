import { vi } from 'vitest'
import { DEFAULT_RUN_TYPE_RULES } from '@/_bff/core/constants/weekly-goals.constants'
import { Effect } from 'effect'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { syncZeppActivities } from '@/_bff/modules/zepp/services/sync-zepp-activities.service'
import type { ParsedLap } from '@/_bff/modules/training/types'
import type { ZeppJson, ZeppRunSummary } from '@/_bff/modules/zepp/types'
import { encryptZeppToken } from '@/_bff/modules/zepp/utils/credentials.utils'
import { readMock } from '@/_bff/modules/zepp/utils/__tests__/mocks'

export const USER_ID = 'user-zepp-1'
export const NOW = new Date('2026-11-21T10:00:00.000Z')
export const DAY_S = 86_400
export const NEWEST_RUN_S = Math.floor(NOW.getTime() / 1000) - 10 * DAY_S
const KEY = Buffer.alloc(32, 9).toString('base64')
export const TOKEN = 'zepp-token'
// The run's lease as the task payload carries it and as the database returns it.
export const RUN_STARTED_AT = '2026-11-21T09:59:00.000Z'
const DB_STARTED_AT = '2026-11-21T09:59:00+00:00'

const json = (body: ZeppJson, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const run = (trackId: number, distance = '1000.0') => ({
    trackid: String(trackId),
    source: 'run.1.huami.com',
    type: 1,
    dis: distance,
    run_time: '300',
    end_time: String(trackId + 400),
    avg_heart_rate: '140.0',
    max_heart_rate: 160,
    calorie: '50.0',
})

export const history = (summary: ZeppJson[]) => ({
    code: 1,
    message: 'success',
    data: { next: -1, summary },
})

export const setup = (
    options: {
        historyBody?: ZeppJson
        historyStatus?: number
        known?: string[]
        duplicates?: string[]
        detailBody?: ZeppJson
        created?: boolean
        connection?: boolean
        connectionGoneAtRead?: number
        leaseAtRead?: { read: number; status: string; startedAt: string | null }
        checkpointMatchesNothing?: boolean
        withoutLaps?: Record<string, string>
    } = {}
) => {
    let reads = 0
    const admin = makeFakeAdminDb((call) => {
        if (call.op !== 'select')
            return ok(options.checkpointMatchesNothing ? null : { user_id: USER_ID })
        reads += 1
        if (options.connection === false || reads >= (options.connectionGoneAtRead ?? Infinity))
            return ok(null)
        const lease =
            options.leaseAtRead && reads >= options.leaseAtRead.read
                ? options.leaseAtRead
                : { status: 'running', startedAt: DB_STARTED_AT }
        return ok({
            encrypted_app_token: encryptZeppToken(TOKEN, KEY),
            last_synced_at: null,
            sync_status: lease.status,
            sync_started_at: lease.startedAt,
            sync_finished_at: null,
            sync_result: null,
            sync_error: null,
        })
    })
    const fetcher = vi.fn<typeof fetch>(async (url) =>
        String(url).includes('history.json')
            ? json(options.historyBody ?? readMock('zepp_history_mock.json'), options.historyStatus)
            : json(options.detailBody ?? readMock('zepp_detail_mock.json'))
    )
    const importedTrackIds: string[] = []
    const importActivity = vi.fn((_user: string, summary: ZeppRunSummary) => {
        importedTrackIds.push(summary.trackId)
        return Effect.succeed({ created: options.created ?? true })
    })
    const findKnownTrackIds = vi.fn(() => Effect.succeed(new Set(options.known ?? [])))
    const findDuplicateTrackIds = vi.fn(() => Effect.succeed(new Set(options.duplicates ?? [])))
    const findRunsWithoutLaps = vi.fn(() =>
        Effect.succeed(new Map(Object.entries(options.withoutLaps ?? {})))
    )
    const replaceRunLaps = vi.fn(
        (_user: string, _activityId: string, _laps: ParsedLap[]) => Effect.void
    )
    const sleep = vi.fn(async () => {})
    const dependencies = {
        createAdminClient: () => admin.supabase,
        encryptionKey: KEY,
        api: { fetch: fetcher },
        createImportContext: () =>
            Effect.succeed({
                supabase: admin.supabase,
                timeZone: 'UTC',
                runTypeRules: DEFAULT_RUN_TYPE_RULES,
            }),
        findKnownTrackIds,
        findDuplicateTrackIds,
        importActivity,
        findRunsWithoutLaps,
        replaceRunLaps,
        sleep,
        now: () => NOW,
    }
    const sync = () =>
        Effect.runPromiseExit(syncZeppActivities(USER_ID, RUN_STARTED_AT, dependencies))
    return {
        admin,
        fetcher,
        importActivity,
        importedTrackIds,
        selects: () => admin.calls.filter((call) => call.op === 'select').length,
        checkpoints: () => admin.calls.filter((call) => call.op === 'update'),
        findKnownTrackIds,
        replaceRunLaps,
        sleep,
        sync,
    }
}

export const detailCalls = (fetcher: ReturnType<typeof setup>['fetcher']) =>
    fetcher.mock.calls.filter(([url]) => String(url).includes('detail.json'))
