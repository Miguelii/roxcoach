// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { syncStravaActivity } from '@/_bff/modules/strava/services/sync-strava-activity.service'
import { makeFakeAdminDb } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'
import {
    ACCESS_TOKEN,
    ACTIVITY_ID,
    fetchMock,
    json,
    lapRows,
    makeSyncDb,
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

const STRAVA_ID = 987654321

// Routes the two Strava endpoints a sync uses.
const stubStrava = (activity: () => Response, laps: () => Response = () => json(stravaLaps(0))) => {
    const fetchStub = fetchMock()
    fetchStub.mockImplementation(async (input) => {
        const url = String(input)
        if (url.endsWith('/laps')) return laps()
        return activity()
    })
    vi.stubGlobal('fetch', fetchStub)
    return fetchStub
}

const useDb = (db: ReturnType<typeof makeFakeAdminDb>) =>
    createDBAdminClientMock.mockReturnValue(db.supabase)

const callsOf = (db: ReturnType<typeof makeFakeAdminDb>, table: string, op: string) =>
    db.calls.filter((call) => call.table === table && call.op === op)

beforeEach(() => {
    getValidAccessTokenMock.mockReturnValue(Effect.succeed(ACCESS_TOKEN))
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
})

describe('syncStravaActivity', () => {
    it('stores a 16-lap Workout as a hyrox activity with its laps tagged by station', async () => {
        const db = makeSyncDb()
        useDb(db)
        const fetchStub = stubStrava(
            () => json(stravaActivity()),
            () => json(stravaLaps(16))
        )

        const result = await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(result).toEqual({ activityId: ACTIVITY_ID })
        const [inserted] = callsOf(db, 'activities', 'insert')
        expect(inserted?.payload).toMatchObject({
            strava_id: STRAVA_ID,
            user_id: USER_ID,
            category: 'hyrox',
            sport_type: 'Workout',
            local_date: '2026-11-18',
            avg_hr: 160,
        })
        const laps = lapRows(db)
        expect(laps).toHaveLength(16)
        expect(laps.every((lap) => lap.activity_id === ACTIVITY_ID)).toBe(true)
        expect(laps.map((lap) => lap.station)).toEqual([
            null,
            'ski_erg',
            null,
            'sled_push',
            null,
            'sled_pull',
            null,
            'burpee_broad_jump',
            null,
            'rowing',
            null,
            'farmers_carry',
            null,
            'sandbag_lunges',
            null,
            'wall_balls',
        ])
        const urls = fetchStub.mock.calls.map(([input]) => String(input))
        expect(urls).toEqual([
            `https://www.strava.com/api/v3/activities/${STRAVA_ID}`,
            `https://www.strava.com/api/v3/activities/${STRAVA_ID}/laps`,
        ])
        expect(fetchStub.mock.calls[0]?.[1]).toMatchObject({
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        })
    })

    it('stores a plain run as a run, with no station tags even with 16 laps', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(
            () => json(stravaActivity({ sport_type: 'Run', name: 'Easy run' })),
            () => json(stravaLaps(16))
        )

        await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(callsOf(db, 'activities', 'insert')[0]?.payload).toMatchObject({ category: 'run' })
        const laps = lapRows(db)
        expect(laps).toHaveLength(16)
        expect(laps.every((lap) => lap.station === null)).toBe(true)
    })

    it.each(['Ride', 'WeightTraining'])(
        'does not tag stations of a %s with 16 laps',
        async (sportType) => {
            const db = makeSyncDb()
            useDb(db)
            stubStrava(
                () => json(stravaActivity({ sport_type: sportType })),
                () => json(stravaLaps(16))
            )

            await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

            const laps = lapRows(db)
            expect(laps).toHaveLength(16)
            expect(laps.every((lap) => lap.station === null)).toBe(true)
        }
    )

    it('keeps a Workout without station laps as cross', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(
            () => json(stravaActivity()),
            () => json(stravaLaps(5))
        )

        await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(callsOf(db, 'activities', 'insert')[0]?.payload).toMatchObject({ category: 'cross' })
    })

    it('stores an activity with zero laps and only clears the old laps', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(() => json(stravaActivity()))

        const result = await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(result).toEqual({ activityId: ACTIVITY_ID })
        expect(callsOf(db, 'activity_laps', 'delete')).toHaveLength(1)
        expect(callsOf(db, 'activity_laps', 'insert')).toHaveLength(0)
    })

    it('stores null heart rate when Strava sends none', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(() =>
            json(stravaActivity({ average_heartrate: null, max_heartrate: undefined }))
        )

        await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(callsOf(db, 'activities', 'insert')[0]?.payload).toMatchObject({
            avg_hr: null,
            max_hr: null,
        })
    })

    it('uses the profile timezone for local_date', async () => {
        const tokyo = makeSyncDb('Asia/Tokyo')
        useDb(tokyo)
        stubStrava(() => json(stravaActivity({ start_date: '2026-11-18T23:30:00Z' })))
        await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))
        expect(callsOf(tokyo, 'activities', 'insert')[0]?.payload).toMatchObject({
            local_date: '2026-11-19',
        })

        const lisbon = makeSyncDb(null)
        useDb(lisbon)
        await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))
        expect(callsOf(lisbon, 'activities', 'insert')[0]?.payload).toMatchObject({
            local_date: '2026-11-18',
        })
    })
})

describe('syncStravaActivity edge cases and failures', () => {
    it('soft-deletes the local activity and returns deleted when Strava says 404', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(() => json({ message: 'Record Not Found' }, 404))

        const result = await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(result).toEqual({ deleted: true })
        const [softDelete] = callsOf(db, 'activities', 'update')
        expect(softDelete?.payload).toMatchObject({ deleted_at: expect.any(String) })
        expect(softDelete?.filters).toContainEqual(['strava_id', STRAVA_ID])
        expect(softDelete?.filters).toContainEqual(['user_id', USER_ID])
        expect(callsOf(db, 'activities', 'insert')).toHaveLength(0)
    })

    it('soft-deletes when the laps endpoint says 404', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(
            () => json(stravaActivity()),
            () => json({}, 404)
        )

        const result = await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(result).toEqual({ deleted: true })
    })

    it('propagates a 429 as StravaRateLimitedError and writes nothing', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(() => json({}, 429, { 'Retry-After': '30' }))

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('StravaRateLimitedError')
        expect(db.calls.filter((call) => call.op !== 'select')).toHaveLength(0)
    })

    it('propagates a 5xx as StravaApiError', async () => {
        useDb(makeSyncDb())
        stubStrava(() => json({}, 503))

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('StravaApiError')
    })

    it('propagates a 401 as StravaUnauthorizedError and never touches the connection', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(() => json({}, 401))

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('StravaUnauthorizedError')
        expect(db.calls.filter((call) => call.table === 'strava_connections')).toHaveLength(0)
    })

    it('fails with StravaPayloadError when the activity payload is malformed', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(() => json({ id: 'not-a-number', name: 'x' }))

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('StravaPayloadError')
        expect(db.calls.filter((call) => call.op !== 'select')).toHaveLength(0)
    })

    it('fails with StravaPayloadError when a lap is malformed', async () => {
        useDb(makeSyncDb())
        stubStrava(
            () => json(stravaActivity()),
            () => json([{ lap_index: 1 }])
        )

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('StravaPayloadError')
    })

    it('fails with StravaPayloadError when the profile timezone is invalid', async () => {
        useDb(makeSyncDb('Not/AZone'))
        stubStrava(() => json(stravaActivity()))

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('StravaPayloadError')
    })

    it('fails with ProfileQueryError when the profile cannot be read', async () => {
        useDb(
            makeFakeAdminDb(
                syncHandler(null, (call) =>
                    call.table === 'athlete_profiles'
                        ? { data: null, error: { code: '42501', message: 'denied' } }
                        : undefined
                )
            )
        )
        stubStrava(() => json(stravaActivity()))

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })

    it('fails with CreateSbClientError when the admin client cannot be created', async () => {
        createDBAdminClientMock.mockImplementation(() => {
            throw new Error('missing key')
        })
        stubStrava(() => json(stravaActivity()))

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })

    it('never puts the access token in a failure', async () => {
        useDb(makeSyncDb())
        const fetchStub = fetchMock()
        fetchStub.mockRejectedValue(new Error(`socket closed for Bearer ${ACCESS_TOKEN}`))
        vi.stubGlobal('fetch', fetchStub)

        const exit = await Effect.runPromiseExit(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(JSON.stringify(exit)).not.toContain(ACCESS_TOKEN)
    })
})
