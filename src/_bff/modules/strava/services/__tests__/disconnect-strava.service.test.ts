// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { StravaNotConnectedError, StravaUnauthorizedError } from '@/_bff/lib/errors'
import { disconnectStrava } from '@/_bff/modules/strava/services/disconnect-strava.service'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'
import {
    ACCESS_TOKEN,
    fetchMock,
    json,
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

const useDb = () => {
    const db = makeFakeAdminDb(() => ok())
    createDBAdminClientMock.mockReturnValue(db.supabase)
    return db
}

const deletes = (db: ReturnType<typeof useDb>) =>
    db.calls.filter((call) => call.table === 'strava_connections' && call.op === 'delete')

describe('disconnectStrava', () => {
    let fetchSpy: ReturnType<typeof fetchMock>

    beforeEach(() => {
        fetchSpy = fetchMock()
        vi.stubGlobal('fetch', fetchSpy)
        createDBAdminClientMock.mockReset()
        getValidAccessTokenMock.mockReset().mockReturnValue(Effect.succeed(ACCESS_TOKEN))
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('deauthorizes with the access token, then deletes the connection of that user only', async () => {
        const db = useDb()
        fetchSpy.mockResolvedValue(json({ access_token: ACCESS_TOKEN }))

        const exit = await Effect.runPromiseExit(disconnectStrava(USER_ID))

        expect(successValue(exit)).toEqual({ disconnected: true })
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        const [url, init] = fetchSpy.mock.calls[0]
        expect(url).toBe('https://www.strava.com/oauth/deauthorize')
        expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
            access_token: ACCESS_TOKEN,
        })
        expect(deletes(db)).toHaveLength(1)
        expect(deletes(db)[0].filters).toEqual([['user_id', USER_ID]])
        expect(db.calls.some((call) => call.table === 'activities')).toBe(false)
    })

    it.each([
        [
            'the deauthorize call fails with a network error',
            () => Promise.reject(new Error('down')),
        ],
        ['Strava answers 401', () => Promise.resolve(json({}, 401))],
        ['Strava answers 500', () => Promise.resolve(json({}, 500))],
    ])('still deletes the connection when %s', async (_label, respond) => {
        const db = useDb()
        fetchSpy.mockImplementation(respond)

        const exit = await Effect.runPromiseExit(disconnectStrava(USER_ID))

        expect(successValue(exit)).toEqual({ disconnected: true })
        expect(deletes(db)).toHaveLength(1)
    })

    it('still deletes the connection when no access token can be obtained', async () => {
        const db = useDb()
        getValidAccessTokenMock.mockReturnValue(
            Effect.fail(
                new StravaUnauthorizedError({
                    cause: 'HTTP 401',
                    error_hash: ErrorCode.STRAVA_OAUTH_UNAUTHORIZED,
                    status: 401,
                })
            )
        )

        const exit = await Effect.runPromiseExit(disconnectStrava(USER_ID))

        expect(successValue(exit)).toEqual({ disconnected: true })
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(deletes(db)).toHaveLength(1)
    })

    it('succeeds when there is no connection', async () => {
        const db = useDb()
        getValidAccessTokenMock.mockReturnValue(
            Effect.fail(
                new StravaNotConnectedError({
                    cause: 'no strava connection for user',
                    error_hash: ErrorCode.STRAVA_TOKEN_NOT_CONNECTED,
                })
            )
        )

        const exit = await Effect.runPromiseExit(disconnectStrava(USER_ID))

        expect(successValue(exit)).toEqual({ disconnected: true })
        expect(deletes(db)).toHaveLength(1)
    })

    it('does not wait forever for a hanging deauthorize call', async () => {
        vi.useFakeTimers()
        const db = useDb()
        fetchSpy.mockImplementation(() => new Promise<Response>(() => {}))

        const pending = Effect.runPromiseExit(disconnectStrava(USER_ID))
        await vi.advanceTimersByTimeAsync(10_000)
        const exit = await pending

        expect(successValue(exit)).toEqual({ disconnected: true })
        expect(deletes(db)).toHaveLength(1)
    })

    it('fails with StravaConnectionError when the delete fails', async () => {
        const db = makeFakeAdminDb((call) =>
            call.op === 'delete' ? { error: { code: '42501', message: 'denied' } } : ok()
        )
        createDBAdminClientMock.mockReturnValue(db.supabase)
        fetchSpy.mockResolvedValue(json({}))

        const exit = await Effect.runPromiseExit(disconnectStrava(USER_ID))

        expect(failureTag(exit)).toBe('StravaConnectionError')
    })
})
