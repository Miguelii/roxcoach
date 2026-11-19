// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import { SYNC_ITEM_DELAY_MS } from '@/_bff/modules/strava/constants'
import { syncMissingActivities } from '@/_bff/modules/strava/services/sync-missing-activities.service'
import {
    ACCESS_TOKEN,
    fetchMock,
    connectionWrites,
    insertedStravaIds,
    json,
    makeSyncDb,
    stravaActivity,
    stravaLaps,
    USER_ID,
} from '@/_bff/modules/strava/services/__tests__/sync-fixtures'

const { createDBAdminClientMock, getValidAccessTokenMock } = vi.hoisted(() => ({
    createDBAdminClientMock: vi.fn(),
    getValidAccessTokenMock: vi.fn(),
}))

vi.mock('@/_bff/core/db', () => ({ createDBAdminClient: createDBAdminClientMock }))
vi.mock('@/env/server', () => ({ ServerEnv: {} }))
vi.mock('@/_bff/modules/strava/services/get-valid-access-token.service', () => ({
    getValidAccessToken: getValidAccessTokenMock,
}))

const NOW = new Date('2026-11-19T10:00:00.000Z')

type Routes = {
    // Response per list page (1-based), an empty page when missing.
    pages: Record<number, () => Response>
    // Response per activity id for the detail endpoint, a valid activity when missing.
    detail?: Record<number, () => Response>
}

const stubStrava = ({ pages, detail = {} }: Routes) => {
    const fetchStub = fetchMock()
    fetchStub.mockImplementation(async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/athlete/activities'))
            return (pages[Number(url.searchParams.get('page'))] ?? (() => json([])))()
        if (url.pathname.endsWith('/laps')) return json(stravaLaps(0))
        const id = Number(url.pathname.split('/').at(-1))
        return (detail[id] ?? (() => json(stravaActivity({ id }))))()
    })
    vi.stubGlobal('fetch', fetchStub)
    return fetchStub
}

const listCalls = (fetchStub: ReturnType<typeof fetchMock>) =>
    fetchStub.mock.calls
        .map(([input]) => new URL(String(input)))
        .filter((url) => url.pathname.endsWith('/athlete/activities'))

// Runs the effect to completion, moving the fake clock through every delay.
const NO_AFTER = { afterEpochS: null }

const run = async (options: { afterEpochS: number | null }) => {
    const pending = Effect.runPromiseExit(syncMissingActivities(USER_ID, options))
    await vi.runAllTimersAsync()
    return pending
}

describe('syncMissingActivities', () => {
    let warn: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
        getValidAccessTokenMock.mockReturnValue(Effect.succeed(ACCESS_TOKEN))
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('pages until an empty page, syncs every activity and touches last_synced_at', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        const fetchStub = stubStrava({
            pages: { 1: () => json([{ id: 1 }, { id: 2 }]), 2: () => json([{ id: 3 }]) },
        })

        const exit = await run(NO_AFTER)

        expect(successValue(exit)).not.toBeNull()
        expect(successValue(exit)).toEqual({ synced: 3 })
        const pages = listCalls(fetchStub)
        expect(pages.map((url) => url.searchParams.get('page'))).toEqual(['1', '2', '3'])
        expect(pages.every((url) => url.searchParams.get('per_page') === '100')).toBe(true)
        expect(
            db.calls.filter((call) => call.table === 'activities' && call.op === 'insert')
        ).toHaveLength(3)
        const touch = connectionWrites(db)[0]
        expect(touch?.op).toBe('update')
        // Stamped with the start of the run, not with the time the delays ended.
        expect(touch?.payload).toEqual({ last_synced_at: NOW.toISOString() })
        expect(touch?.filters).toEqual([['user_id', USER_ID]])
    })

    it('does not touch last_synced_at when the pass is not the final one', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        stubStrava({ pages: { 1: () => json([{ id: 1 }]) } })

        const pending = Effect.runPromiseExit(
            syncMissingActivities(USER_ID, { afterEpochS: null, markSynced: false })
        )
        await vi.runAllTimersAsync()
        const exit = await pending

        expect(successValue(exit)).toEqual({ synced: 1 })
        expect(connectionWrites(db)).toEqual([])
    })

    it('sends after when given and omits it otherwise', async () => {
        createDBAdminClientMock.mockReturnValue(makeSyncDb().supabase)
        const withAfter = stubStrava({ pages: {} })
        await run({ afterEpochS: 1763000000 })
        expect(listCalls(withAfter)[0]?.searchParams.get('after')).toBe('1763000000')

        const withoutAfter = stubStrava({ pages: {} })
        await run(NO_AFTER)
        expect(listCalls(withoutAfter)[0]?.searchParams.has('after')).toBe(false)
    })

    it('returns zero synced and still touches last_synced_at when nothing is missing', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        stubStrava({ pages: {} })

        const exit = await run(NO_AFTER)

        expect(successValue(exit)).toEqual({ synced: 0 })
        expect(connectionWrites(db)).toHaveLength(1)
    })

    it('waits SYNC_ITEM_DELAY_MS between activities', async () => {
        createDBAdminClientMock.mockReturnValue(makeSyncDb().supabase)
        const fetchStub = stubStrava({
            pages: { 1: () => json([{ id: 1 }, { id: 2 }, { id: 3 }]) },
        })
        const detailCalls = () =>
            fetchStub.mock.calls.filter(([input]) => /\/activities\/\d+$/u.test(String(input)))
                .length

        const pending = Effect.runPromiseExit(syncMissingActivities(USER_ID, { afterEpochS: null }))
        await vi.advanceTimersByTimeAsync(0)
        expect(detailCalls()).toBe(1)

        await vi.advanceTimersByTimeAsync(SYNC_ITEM_DELAY_MS - 1)
        expect(detailCalls()).toBe(1)

        await vi.advanceTimersByTimeAsync(1)
        expect(detailCalls()).toBe(2)

        await vi.advanceTimersByTimeAsync(SYNC_ITEM_DELAY_MS)
        expect(detailCalls()).toBe(3)

        await vi.runAllTimersAsync()
        await pending
    })

    it('keeps what was synced and propagates a 429 mid-way, without touching last_synced_at', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        stubStrava({
            pages: { 1: () => json([{ id: 1 }, { id: 2 }, { id: 3 }]) },
            detail: { 2: () => json({}, 429, { 'Retry-After': '60' }) },
        })

        const exit = await run(NO_AFTER)

        expect(failureTag(exit)).toBe('StravaRateLimitedError')
        expect(insertedStravaIds(db)).toEqual([1])
        expect(connectionWrites(db)).toHaveLength(0)
    })

    it('propagates a failing list page without touching last_synced_at', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        stubStrava({ pages: { 1: () => json({}, 503) } })

        const exit = await run(NO_AFTER)

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(connectionWrites(db)).toHaveLength(0)
    })

    it('skips and logs a malformed activity without aborting or counting it', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        stubStrava({
            pages: { 1: () => json([{ id: 1 }, { id: 2 }, { id: 3 }]) },
            detail: {
                2: () => json({ id: 2, name: 'broken', sport_type: 'Run', start_date: 'nope' }),
            },
        })

        const exit = await run(NO_AFTER)

        expect(successValue(exit)).toEqual({ synced: 2 })
        expect(insertedStravaIds(db)).toEqual([1, 3])
        expect(warn).toHaveBeenCalledTimes(1)
        const logged = JSON.stringify(warn.mock.calls)
        expect(logged).toContain('StravaPayloadError')
        expect(logged).toContain('2')
        expect(logged).not.toContain(ACCESS_TOKEN)
        expect(connectionWrites(db)).toHaveLength(1)
    })

    it('fails the whole run on an invalid profile timezone, before any request', async () => {
        const db = makeSyncDb('Not/AZone')
        createDBAdminClientMock.mockReturnValue(db.supabase)
        const fetchStub = stubStrava({ pages: { 1: () => json([{ id: 1 }]) } })

        const exit = await run(NO_AFTER)

        expect(failureTag(exit)).toBe('ProfileQueryError')
        expect(fetchStub).not.toHaveBeenCalled()
        expect(connectionWrites(db)).toHaveLength(0)
    })

    it('skips an activity that belongs to another athlete, without counting it', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        stubStrava({
            pages: { 1: () => json([{ id: 1 }, { id: 2 }]) },
            detail: { 1: () => json(stravaActivity({ id: 1, athlete: { id: 999 } })) },
        })

        const exit = await run(NO_AFTER)

        expect(successValue(exit)).toEqual({ synced: 1 })
        expect(insertedStravaIds(db)).toEqual([2])
        expect(warn).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(warn.mock.calls)).toContain('StravaPayloadError')
    })

    it('costs one request for a malformed activity (no laps request)', async () => {
        createDBAdminClientMock.mockReturnValue(makeSyncDb().supabase)
        const fetchStub = stubStrava({
            pages: { 1: () => json([{ id: 1 }]) },
            detail: { 1: () => json({ id: 1 }) },
        })

        await run(NO_AFTER)

        const lapCalls = fetchStub.mock.calls.filter(([input]) => String(input).endsWith('/laps'))
        expect(lapCalls).toHaveLength(0)
    })

    it('skips a list entry without a numeric id', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        stubStrava({ pages: { 1: () => json([{ name: 'no id' }, null, { id: 5 }]) } })

        const exit = await run(NO_AFTER)

        expect(successValue(exit)).toEqual({ synced: 1 })
        expect(warn).toHaveBeenCalledTimes(2)
    })

    it('soft-deletes an activity Strava reports as 404 and does not count it', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)
        stubStrava({
            pages: { 1: () => json([{ id: 1 }, { id: 2 }]) },
            detail: { 1: () => json({}, 404) },
        })

        const exit = await run(NO_AFTER)

        expect(successValue(exit)).toEqual({ synced: 1 })
        const softDelete = db.calls.find(
            (call) => call.table === 'activities' && call.op === 'update'
        )
        expect(softDelete?.filters).toContainEqual(['strava_id', 1])
    })

    it('never puts the access token in a failure', async () => {
        createDBAdminClientMock.mockReturnValue(makeSyncDb().supabase)
        const fetchStub = fetchMock()
        fetchStub.mockRejectedValue(new Error(`socket closed for Bearer ${ACCESS_TOKEN}`))
        vi.stubGlobal('fetch', fetchStub)

        const exit = await run(NO_AFTER)

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(JSON.stringify(exit)).not.toContain(ACCESS_TOKEN)
    })
})
