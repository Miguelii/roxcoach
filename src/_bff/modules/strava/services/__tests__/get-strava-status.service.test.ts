// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import { getStravaStatus } from '@/_bff/modules/strava/services/get-strava-status.service'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'
import { ACCESS_TOKEN, USER_ID } from '@/_bff/modules/strava/services/__tests__/sync-fixtures'

const { createDBAdminClientMock } = vi.hoisted(() => ({ createDBAdminClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBAdminClient: createDBAdminClientMock }))
vi.mock('@/env/server', () => ({ ServerEnv: {} }))

const REFRESH_TOKEN = 'secret-refresh-token-def'
const SCOPE = 'read,activity:read_all'

const CONNECTION = {
    user_id: USER_ID,
    strava_athlete_id: 12345,
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_at: '2026-11-19T18:00:00+00:00',
    scope: SCOPE,
    connected_at: '2026-11-01T08:00:00+00:00',
    last_synced_at: '2026-11-18T21:00:00+00:00',
}

const useDb = (connection: typeof CONNECTION | null, count: number | null) => {
    const db = makeFakeAdminDb((call) =>
        call.table === 'activities' ? { data: null, count, error: null } : ok(connection)
    )
    createDBAdminClientMock.mockReturnValue(db.supabase)
    return db
}

describe('getStravaStatus', () => {
    beforeEach(() => {
        createDBAdminClientMock.mockReset()
    })

    it('returns the connection summary and the live Strava activity count', async () => {
        const db = useDb(CONNECTION, 37)

        const status = successValue(await Effect.runPromiseExit(getStravaStatus(USER_ID)))

        expect(status).toEqual({
            connected: true,
            athleteId: 12345,
            connectedAt: CONNECTION.connected_at,
            lastSyncedAt: CONNECTION.last_synced_at,
            activityCount: 37,
        })
        const count = db.calls.find((call) => call.table === 'activities')
        expect(count?.filters).toEqual(
            expect.arrayContaining([
                ['user_id', USER_ID],
                ['strava_id:not:is', null],
                ['deleted_at', null],
            ])
        )
        const select = db.calls.find((call) => call.table === 'strava_connections')
        expect(select?.filters).toEqual([['user_id', USER_ID]])
    })

    it('never returns a token, the scope or any key named after them', async () => {
        useDb(CONNECTION, 3)

        const status = successValue(await Effect.runPromiseExit(getStravaStatus(USER_ID)))
        // The status is flat, so its own keys are every key it has.
        const keys = Object.keys(status ?? {})
        expect(keys.length).toBeGreaterThan(0)
        const serialized = JSON.stringify(status)

        expect(keys).not.toContain('access_token')
        expect(keys).not.toContain('refresh_token')
        expect(keys).not.toContain('scope')
        expect(serialized).not.toContain(ACCESS_TOKEN)
        expect(serialized).not.toContain(REFRESH_TOKEN)
        expect(serialized).not.toContain(SCOPE)
    })

    it('reports not connected and still counts the kept activities', async () => {
        useDb(null, 12)

        const status = successValue(await Effect.runPromiseExit(getStravaStatus(USER_ID)))

        expect(status).toEqual({
            connected: false,
            athleteId: null,
            connectedAt: null,
            lastSyncedAt: null,
            activityCount: 12,
        })
    })

    it('fails with StravaConnectionError when the connection cannot be read', async () => {
        const db = makeFakeAdminDb(() => ({ error: { code: '42501', message: 'denied' } }))
        createDBAdminClientMock.mockReturnValue(db.supabase)

        const exit = await Effect.runPromiseExit(getStravaStatus(USER_ID))

        expect(failureTag(exit)).toBe('StravaConnectionError')
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBAdminClientMock.mockImplementation(() => {
            throw new Error('missing env')
        })

        const exit = await Effect.runPromiseExit(getStravaStatus(USER_ID))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})
