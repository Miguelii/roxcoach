import { vi } from 'vitest'
import {
    type Call,
    type Json,
    makeFakeAdminDb,
    ok,
    type QueryResult,
} from '@/_bff/modules/strava/services/__tests__/fake-admin-db'

export const USER_ID = 'user-1'
export const ACTIVITY_ID = '7a1f0f4e-3b0e-4c53-9a0a-6a3a3d2f9c11'
export const ACCESS_TOKEN = 'secret-access-token-abc'
export const STRAVA_ATHLETE_ID = 12345

type ActivityOverrides = {
    id?: number
    name?: string
    sport_type?: string
    start_date?: string
    average_heartrate?: number | null
    max_heartrate?: number | null
    athlete?: { id: number } | null
}

type LapPayload = { station: string | null; activity_id: string }

export const stravaActivity = (overrides: ActivityOverrides = {}) => ({
    id: 987654321,
    name: 'Morning session',
    sport_type: 'Workout',
    start_date: '2026-11-18T07:30:00Z',
    distance: 8000,
    moving_time: 4000,
    elapsed_time: 4100,
    total_elevation_gain: 20,
    average_heartrate: 160,
    max_heartrate: 185,
    average_speed: 2,
    calories: 800,
    ...overrides,
})

export const stravaLaps = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
        lap_index: index + 1,
        name: `Lap ${index + 1}`,
        distance: 1000,
        elapsed_time: 300,
        moving_time: 295,
        average_heartrate: 150,
        average_speed: 3.4,
    }))

export const json = (body: Json, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    })

// The activity table behaves as an empty one (the upsert inserts), the profile as given.
export const syncHandler =
    (timezone: string | null = null, overrides?: (call: Call) => QueryResult | undefined) =>
    (call: Call): QueryResult => {
        const overridden = overrides?.(call)
        if (overridden) return overridden
        if (call.table === 'strava_connections' && call.op === 'select')
            return ok({
                user_id: USER_ID,
                strava_athlete_id: STRAVA_ATHLETE_ID,
                access_token: ACCESS_TOKEN,
                refresh_token: 'secret-refresh-token-def',
                expires_at: '2026-11-19T18:00:00+00:00',
                scope: 'read,activity:read_all',
                connected_at: '2026-11-01T08:00:00+00:00',
                last_synced_at: null,
            })
        if (call.table === 'athlete_profiles') return ok(timezone === null ? null : { timezone })
        if (call.table === 'activities' && call.op === 'select')
            return call.filters.some(([column]) => column === 'strava_id:in') ? ok([]) : ok(null)
        if (call.table === 'activities' && call.op === 'insert') return ok({ id: ACTIVITY_ID })
        return ok()
    }

export const makeSyncDb = (timezone: string | null = null) => makeFakeAdminDb(syncHandler(timezone))

export const fetchMock = () => vi.fn<typeof fetch>()

const insertedLaps = (db: ReturnType<typeof makeFakeAdminDb>) =>
    db.calls.find((call) => call.table === 'activity_laps' && call.op === 'insert')

// The lap rows the service inserted, or an empty list when it inserted none.
export const lapRows = (db: ReturnType<typeof makeFakeAdminDb>): LapPayload[] => {
    // SAFETY: the fake records the exact rows the service passed to insert.
    const rows = insertedLaps(db)?.payload as LapPayload[] | undefined
    return rows ?? []
}

// The strava_id of every activity row the service inserted, in order.
export const insertedStravaIds = (db: ReturnType<typeof makeFakeAdminDb>): number[] =>
    // SAFETY: the fake records the exact row the service passed to insert.
    db.calls
        .filter((call) => call.table === 'activities' && call.op === 'insert')
        .map((call) => (call.payload as { strava_id: number }).strava_id)

// Writes to the connection row (the sync only ever touches last_synced_at).
export const connectionWrites = (db: ReturnType<typeof makeFakeAdminDb>) =>
    db.calls.filter((call) => call.table === 'strava_connections' && call.op !== 'select')
