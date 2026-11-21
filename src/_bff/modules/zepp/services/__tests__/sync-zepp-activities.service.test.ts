// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import { syncZeppActivities } from '@/_bff/modules/zepp/services/sync-zepp-activities.service'
import type { ZeppJson, ZeppRunSummary } from '@/_bff/modules/zepp/types'
import { encryptZeppToken } from '@/_bff/modules/zepp/utils/credentials.utils'
import { readMock } from '@/_bff/modules/zepp/utils/__tests__/mocks'

// SAFETY: the sync only reads the authenticated user's ID.
const USER = { id: 'user-zepp-1' } as User
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
    } = {}
) => {
    const admin = makeFakeDb([
        options.connection === false
            ? ok(null)
            : ok({ encrypted_app_token: encryptZeppToken(TOKEN, KEY), last_synced_at: null }),
        ok({ user_id: USER.id }),
    ])
    const fetcher = vi.fn<typeof fetch>(async (url) =>
        String(url).includes('history.json')
            ? json(options.historyBody ?? readMock('zepp_history_mock.json'), options.historyStatus)
            : json(options.detailBody ?? readMock('zepp_detail_mock.json'))
    )
    const importedTrackIds: string[] = []
    const importActivity = vi.fn((_user: User, summary: ZeppRunSummary) => {
        importedTrackIds.push(summary.trackId)
        return Effect.succeed({ created: options.created ?? true })
    })
    const findKnownTrackIds = vi.fn(() => Effect.succeed(new Set(options.known ?? [])))
    const findDuplicateTrackIds = vi.fn(() => Effect.succeed(new Set(options.duplicates ?? [])))
    const sleep = vi.fn(async () => {})
    const dependencies = {
        createAdminClient: () => admin.supabase,
        encryptionKey: KEY,
        api: { fetch: fetcher },
        createImportContext: () => Effect.succeed({ supabase: admin.supabase, timeZone: 'UTC' }),
        findKnownTrackIds,
        findDuplicateTrackIds,
        importActivity,
        sleep,
        now: () => new Date('2026-11-21T10:00:00.000Z'),
    }
    const sync = () => Effect.runPromiseExit(syncZeppActivities(USER, dependencies))
    return { admin, fetcher, importActivity, importedTrackIds, findKnownTrackIds, sleep, sync }
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
            remaining: 0,
        })
        expect(importActivity).toHaveBeenCalledTimes(1)
        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(String(detailCalls(fetcher)[0]?.[0])).toContain('trackid=1794943080')
        expect(admin.chains[1]?.update).toHaveBeenCalledWith({
            last_synced_at: '2026-11-21T10:00:00.000Z',
        })
        const init = fetcher.mock.calls[0]?.[1]
        expect(init?.headers).toMatchObject({ apptoken: TOKEN })
    })

    it('does not fetch a run without distance', async () => {
        const { fetcher, sync } = setup({ historyBody: history([run(2000, '0.0'), run(1000)]) })

        await sync()

        expect(detailCalls(fetcher)).toHaveLength(1)
        expect(String(detailCalls(fetcher)[0]?.[0])).toContain('trackid=1000')
    })

    it('does not fetch a run that is already imported', async () => {
        const { fetcher, importActivity, sync } = setup({ known: ['1794943080'] })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 0,
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
            remaining: 0,
        })
    })

    it('imports the newest 50 first, reports the rest and waits between detail requests', async () => {
        const runs = Array.from({ length: 53 }, (_, index) => run(1000 + index))
        const { importedTrackIds, sleep, sync } = setup({ historyBody: history(runs) })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 50,
            skipped: 0,
            remaining: 3,
        })
        expect(sleep).toHaveBeenCalledTimes(49)
        expect(sleep).toHaveBeenCalledWith(500)
        expect(importedTrackIds[0]).toBe('1052')
        expect(importedTrackIds.at(-1)).toBe('1003')
    })

    it('stops with an expired session and leaves the checkpoint alone', async () => {
        const { admin, sync } = setup({ historyStatus: 401 })

        const exit = await sync()

        expect(failureTag(exit)).toBe('ZeppSessionExpiredError')
        expect(admin.chains).toHaveLength(1)
    })

    it('fails when Zepp is not connected', async () => {
        const { fetcher, sync } = setup({ connection: false })

        expect(failureTag(await sync())).toBe('ZeppConnectionNotFoundError')
        expect(fetcher).not.toHaveBeenCalled()
    })

    it('does not fetch a run the athlete already uploaded by hand, nor spend the batch on it', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(1000 + index))
        const duplicates = runs.slice(5).map((item) => String(item.trackid))
        const { fetcher, importedTrackIds, sync } = setup({
            historyBody: history(runs),
            duplicates,
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 5,
            skipped: 0,
            remaining: 0,
        })
        expect(detailCalls(fetcher)).toHaveLength(5)
        expect(importedTrackIds).toEqual(['1004', '1003', '1002', '1001', '1000'])
    })

    it('skips a run whose detail Zepp refuses and keeps going with the others', async () => {
        const { importedTrackIds, sync } = setup({
            historyBody: history([run(2000), run(1000)]),
            detailBody: { code: 0, message: 'no data' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 2,
            remaining: 0,
        })
        expect(importedTrackIds).toEqual([])
    })
})
