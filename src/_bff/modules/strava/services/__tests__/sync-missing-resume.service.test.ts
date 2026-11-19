// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import { syncMissingActivities } from '@/_bff/modules/strava/services/sync-missing-activities.service'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'
import {
    ACCESS_TOKEN,
    fetchMock,
    json,
    stravaActivity,
    stravaLaps,
    syncHandler,
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

const PAGE = () => json([{ id: 1 }, { id: 2 }, { id: 3 }])

const stubStrava = (rateLimitedId: number | null) => {
    const fetchStub = fetchMock()
    fetchStub.mockImplementation(async (input) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/athlete/activities'))
            return url.searchParams.get('page') === '1' ? PAGE() : json([])
        if (url.pathname.endsWith('/laps')) return json(stravaLaps(0))
        const id = Number(url.pathname.split('/').at(-1))
        return id === rateLimitedId
            ? json({}, 429, { 'Retry-After': '60' })
            : json(stravaActivity({ id }))
    })
    vi.stubGlobal('fetch', fetchStub)
    return fetchStub
}

const run = async () => {
    const pending = Effect.runPromiseExit(syncMissingActivities(USER_ID, { afterEpochS: null }))
    await vi.runAllTimersAsync()
    return pending
}

describe('syncMissingActivities resuming', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        getValidAccessTokenMock.mockReturnValue(Effect.succeed(ACCESS_TOKEN))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it('continues where a rate-limited run stopped by skipping the stored activities', async () => {
        // The fake table remembers inserted activities, so the existence query sees them.
        const stored = new Set<number>()
        const db = makeFakeAdminDb(
            syncHandler(null, (call) => {
                if (call.table !== 'activities') return
                if (call.op === 'insert')
                    // SAFETY: the fake records the row the service inserted.
                    stored.add((call.payload as { strava_id: number }).strava_id)
                const isExistingQuery = call.filters.some(([column]) => column === 'strava_id:in')
                if (call.op === 'select' && isExistingQuery)
                    return ok([...stored].map((strava_id) => ({ strava_id })))
            })
        )
        createDBAdminClientMock.mockReturnValue(db.supabase)

        stubStrava(2)
        const first = await run()
        expect(failureTag(first)).toBe('StravaRateLimitedError')
        expect([...stored]).toEqual([1])

        const fetchStub = stubStrava(null)
        const second = await run()

        expect(successValue(second)).toEqual({ synced: 2 })
        expect([...stored]).toEqual([1, 2, 3])
        const detailPaths = fetchStub.mock.calls
            .map(([input]) => new URL(String(input)).pathname)
            .filter((path) => /\/activities\/\d+$/u.test(path))
        expect(detailPaths).toEqual(['/api/v3/activities/2', '/api/v3/activities/3'])
        const existingQuery = db.calls.findLast((call) =>
            call.filters.some(([column]) => column === 'strava_id:in')
        )
        expect(existingQuery?.filters).toContainEqual(['user_id', USER_ID])
        expect(existingQuery?.filters).toContainEqual(['strava_id:in', [1, 2, 3]])
        // A soft-deleted activity does not count as stored, so it is synced again.
        expect(existingQuery?.filters).toContainEqual(['deleted_at', null])
    })
})
