// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { syncZeppActivities } from '@/_bff/modules/zepp/services/sync-zepp-activities.service'
import type { ParsedLap } from '@/_bff/modules/training/types'
import type { ZeppJson, ZeppRunSummary } from '@/_bff/modules/zepp/types'
import { encryptZeppToken } from '@/_bff/modules/zepp/utils/credentials.utils'
import { readMock } from '@/_bff/modules/zepp/utils/__tests__/mocks'

const USER_ID = 'user-zepp-1'
const NOW = new Date('2026-11-21T10:00:00.000Z')
const DAY_S = 86_400
const NEWEST_RUN_S = Math.floor(NOW.getTime() / 1000) - 10 * DAY_S
const KEY = Buffer.alloc(32, 9).toString('base64')
const TOKEN = 'zepp-token'

const json = (body: ZeppJson, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const run = (trackId: number, distance = '1000.0') => ({
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

const history = (summary: ZeppJson[]) => ({
    code: 1,
    message: 'success',
    data: { next: -1, summary },
})

const setup = (
    options: {
        historyBody?: ZeppJson
        historyStatus?: number
        known?: string[]
        duplicates?: string[]
        detailBody?: ZeppJson
        created?: boolean
        connection?: boolean
        connectionGoneAtRead?: number
        withoutLaps?: Record<string, string>
    } = {}
) => {
    let reads = 0
    const admin = makeFakeAdminDb((call) => {
        if (call.op !== 'select') return ok({ user_id: USER_ID })
        reads += 1
        if (options.connection === false || reads >= (options.connectionGoneAtRead ?? Infinity))
            return ok(null)
        return ok({
            encrypted_app_token: encryptZeppToken(TOKEN, KEY),
            last_synced_at: null,
            sync_status: 'running',
            sync_started_at: '2026-11-21T09:59:00.000Z',
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
        createImportContext: () => Effect.succeed({ supabase: admin.supabase, timeZone: 'UTC' }),
        findKnownTrackIds,
        findDuplicateTrackIds,
        importActivity,
        findRunsWithoutLaps,
        replaceRunLaps,
        sleep,
        now: () => NOW,
    }
    const sync = () => Effect.runPromiseExit(syncZeppActivities(USER_ID, dependencies))
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

const detailCalls = (fetcher: ReturnType<typeof setup>['fetcher']) =>
    fetcher.mock.calls.filter(([url]) => String(url).includes('detail.json'))

describe('syncZeppActivities', () => {
    it('imports the one outdoor run of the real history and ignores every other workout', async () => {
        const { admin, fetcher, importActivity, sync } = setup()

        const exit = await sync()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 1,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(importActivity).toHaveBeenCalledTimes(1)
        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(String(detailCalls(fetcher)[0]?.[0])).toContain('trackid=1794943080')
        expect(admin.calls[1]).toMatchObject({
            op: 'update',
            payload: { last_synced_at: '2026-11-21T10:00:00.000Z' },
        })
        const init = fetcher.mock.calls[0]?.[1]
        expect(init?.headers).toMatchObject({ apptoken: TOKEN })
    })

    it('does not fetch a run without distance', async () => {
        const { fetcher, sync } = setup({
            historyBody: history([run(NEWEST_RUN_S, '0.0'), run(NEWEST_RUN_S - 100)]),
        })

        await sync()

        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(String(detailCalls(fetcher)[0]?.[0])).toContain(`trackid=${NEWEST_RUN_S - 100}`)
    })

    it('does not fetch a run that is already imported', async () => {
        const { fetcher, importActivity, sync } = setup({ known: ['1794943080'] })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(detailCalls(fetcher)).toHaveLength(0)
        expect(importActivity).not.toHaveBeenCalled()
    })

    it('counts a run the import skips as skipped', async () => {
        const { sync } = setup({ created: false })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 1,
            updated: 0,
            remaining: 0,
        })
    })

    it('imports 60 new runs in one call, newest first, and waits between detail requests', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(NEWEST_RUN_S - 100 + index))
        const { importedTrackIds, sleep, sync } = setup({ historyBody: history(runs) })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 60,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(sleep).toHaveBeenCalledTimes(59)
        expect(sleep).toHaveBeenCalledWith(500)
        expect(importedTrackIds[0]).toBe(String(NEWEST_RUN_S - 100 + 59))
        expect(importedTrackIds.at(-1)).toBe(String(NEWEST_RUN_S - 100))
    })

    it('keeps only the last 360 days of the history, before importing and before backfilling laps', async () => {
        const nowS = Math.floor(NOW.getTime() / 1000)
        const old = nowS - 361 * DAY_S
        const recent = nowS - 359 * DAY_S
        const { fetcher, importedTrackIds, replaceRunLaps, sync } = setup({
            historyBody: history([run(recent), run(old), run(old - 1)]),
            known: [String(old - 1)],
            withoutLaps: { [String(old - 1)]: 'activity-old' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 1,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(importedTrackIds).toEqual([String(recent)])
        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(replaceRunLaps).not.toHaveBeenCalled()
    })

    it('stops quietly when the connection is gone at the 25th detail and leaves the checkpoint alone', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(NEWEST_RUN_S - 100 + index))
        const { checkpoints, importedTrackIds, selects, sync } = setup({
            historyBody: history(runs),
            connectionGoneAtRead: 2,
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(Exit.isSuccess(exit) && exit.value.imported).toBeLessThanOrEqual(25)
        expect(importedTrackIds.length).toBeLessThanOrEqual(25)
        expect(selects()).toBe(2)
        expect(checkpoints()).toHaveLength(0)
    })

    it('stops with an expired session and leaves the checkpoint alone', async () => {
        const { admin, sync } = setup({ historyStatus: 401 })

        const exit = await sync()

        expect(failureTag(exit)).toBe('ZeppSessionExpiredError')
        expect(admin.calls).toHaveLength(1)
    })

    it('fails when Zepp is not connected', async () => {
        const { fetcher, sync } = setup({ connection: false })

        expect(failureTag(await sync())).toBe('ZeppConnectionNotFoundError')
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('does not fetch a run the athlete already uploaded by hand, nor spend the batch on it', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(NEWEST_RUN_S - 100 + index))
        const duplicates = runs.slice(5).map((item) => String(item.trackid))
        const { fetcher, importedTrackIds, sync } = setup({
            historyBody: history(runs),
            duplicates,
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 5,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(detailCalls(fetcher)).toHaveLength(5)
        expect(importedTrackIds).toEqual(
            [4, 3, 2, 1, 0].map((offset) => String(NEWEST_RUN_S - 100 + offset))
        )
    })

    it('skips a run whose detail Zepp refuses and keeps going with the others', async () => {
        const { importedTrackIds, sync } = setup({
            historyBody: history([run(NEWEST_RUN_S), run(NEWEST_RUN_S - 100)]),
            detailBody: { code: 0, message: 'no data' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 2,
            updated: 0,
            remaining: 0,
        })
        expect(importedTrackIds).toEqual([])
    })

    it('adds the kilometre laps to a run imported before laps existed', async () => {
        const { fetcher, importActivity, replaceRunLaps, sync } = setup({
            known: ['1794943080'],
            withoutLaps: { '1794943080': 'activity-1' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 0,
            updated: 1,
            remaining: 0,
        })
        expect(importActivity).not.toHaveBeenCalled()
        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(replaceRunLaps.mock.calls[0]?.[1]).toBe('activity-1')
        expect(replaceRunLaps.mock.calls[0]?.[2]).toHaveLength(4)
    })

    it('imports new runs first and leaves the laps for the next sync when the ceiling is reached', async () => {
        const runs = Array.from({ length: 1001 }, (_, index) => run(NEWEST_RUN_S - 2000 + index))
        const { replaceRunLaps, sync } = setup({
            historyBody: history(runs),
            known: [String(NEWEST_RUN_S - 2000)],
            withoutLaps: { [String(NEWEST_RUN_S - 2000)]: 'activity-1' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 1000,
            skipped: 0,
            updated: 0,
            remaining: 1,
        })
        expect(replaceRunLaps).not.toHaveBeenCalled()
    })

    it('leaves a run without laps for the next sync when Zepp refuses its detail', async () => {
        const { replaceRunLaps, sync } = setup({
            known: ['1794943080'],
            withoutLaps: { '1794943080': 'activity-1' },
            detailBody: { code: 0, message: 'no data' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toMatchObject({ updated: 0, remaining: 0 })
        expect(replaceRunLaps).not.toHaveBeenCalled()
    })
})
