// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { syncStravaActivity } from '@/_bff/modules/strava/services/sync-strava-activity.service'
import { makeFakeAdminDb } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'
import {
    ACCESS_TOKEN,
    fetchMock,
    json,
    lapRows,
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

describe('syncStravaActivity station tagging', () => {
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

    it('tags a 16-lap Crossfit and keeps it as strength', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(
            () => json(stravaActivity({ sport_type: 'Crossfit' })),
            () => json(stravaLaps(16))
        )

        await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(callsOf(db, 'activities', 'insert')[0]?.payload).toMatchObject({
            category: 'strength',
        })
        expect(lapRows(db).filter((lap) => lap.station !== null)).toHaveLength(8)
    })

    it('tags a 16-lap HighIntensityIntervalTraining and makes it hyrox', async () => {
        const db = makeSyncDb()
        useDb(db)
        stubStrava(
            () => json(stravaActivity({ sport_type: 'HighIntensityIntervalTraining' })),
            () => json(stravaLaps(16))
        )

        await Effect.runPromise(syncStravaActivity(USER_ID, STRAVA_ID))

        expect(callsOf(db, 'activities', 'insert')[0]?.payload).toMatchObject({
            category: 'hyrox',
        })
        expect(lapRows(db).filter((lap) => lap.station !== null)).toHaveLength(8)
    })

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
})
