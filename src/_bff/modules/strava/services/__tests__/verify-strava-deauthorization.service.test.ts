// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    StravaApiError,
    StravaNotConnectedError,
    StravaRateLimitedError,
    StravaUnauthorizedError,
} from '@/_bff/lib/errors'
import { verifyStravaDeauthorization } from '@/_bff/modules/strava/services/verify-strava-deauthorization.service'
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

const REFRESH_SECRET = 'secret-refresh-token-def'

const refreshInvalidGrant = () =>
    Effect.fail(
        new StravaApiError({
            cause: 'HTTP 400',
            error_hash: ErrorCode.STRAVA_OAUTH_HTTP,
            status: 400,
        })
    )

const refreshUnauthorized = (status: 401 | 403) =>
    Effect.fail(
        new StravaUnauthorizedError({
            cause: `HTTP ${status}`,
            error_hash: ErrorCode.STRAVA_OAUTH_UNAUTHORIZED,
            status,
        })
    )

const useDb = () => {
    const db = makeFakeAdminDb(() => ok())
    createDBAdminClientMock.mockReturnValue(db.supabase)
    return db
}

const deletes = (db: ReturnType<typeof useDb>) =>
    db.calls.filter((call) => call.table === 'strava_connections' && call.op === 'delete')

const stubAthlete = (response: () => Response) => {
    const fetchStub = fetchMock()
    fetchStub.mockImplementation(async () => response())
    vi.stubGlobal('fetch', fetchStub)
    return fetchStub
}

const run = () => Effect.runPromiseExit(verifyStravaDeauthorization(USER_ID))

describe('verifyStravaDeauthorization', () => {
    beforeEach(() => {
        getValidAccessTokenMock.mockReturnValue(Effect.succeed(ACCESS_TOKEN))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.clearAllMocks()
    })

    it('keeps the connection when GET /athlete succeeds', async () => {
        const db = useDb()
        const fetchStub = stubAthlete(() => json({ id: 12345 }))

        const exit = await run()

        expect(successValue(exit)).toEqual({ disconnected: false })
        expect(deletes(db)).toHaveLength(0)
        expect(String(fetchStub.mock.calls[0]?.[0])).toBe('https://www.strava.com/api/v3/athlete')
    })

    it('deletes the connection when GET /athlete answers 401', async () => {
        const db = useDb()
        stubAthlete(() => json({ message: 'Authorization Error' }, 401))

        const exit = await run()

        expect(successValue(exit)).toEqual({ disconnected: true })
        expect(deletes(db)).toHaveLength(1)
        expect(deletes(db)[0]?.filters).toEqual([['user_id', USER_ID]])
    })

    it('deletes the connection when the refresh is rejected with 400 (read twice)', async () => {
        const db = useDb()
        getValidAccessTokenMock.mockReturnValue(refreshInvalidGrant())
        const fetchStub = stubAthlete(() => json({}))

        const exit = await run()

        expect(successValue(exit)).toEqual({ disconnected: true })
        expect(deletes(db)).toHaveLength(1)
        expect(getValidAccessTokenMock).toHaveBeenCalledTimes(2)
        expect(fetchStub).not.toHaveBeenCalled()
    })

    it.each([401, 403] as const)(
        'keeps the connection and propagates a refresh rejected with %i',
        async (status) => {
            const db = useDb()
            getValidAccessTokenMock.mockReturnValue(refreshUnauthorized(status))
            const fetchStub = stubAthlete(() => json({}))

            const exit = await run()

            expect(failureTag(exit)).toBe('StravaUnauthorizedError')
            expect(deletes(db)).toHaveLength(0)
            expect(getValidAccessTokenMock).toHaveBeenCalledTimes(1)
            expect(fetchStub).not.toHaveBeenCalled()
        }
    )

    it('keeps the connection and propagates a 403 from GET /athlete', async () => {
        const db = useDb()
        stubAthlete(() => json({ message: 'Forbidden' }, 403))

        const exit = await run()

        expect(failureTag(exit)).toBe('StravaUnauthorizedError')
        expect(deletes(db)).toHaveLength(0)
    })

    it('keeps the connection when the second token read succeeds (refresh race loser)', async () => {
        const db = useDb()
        getValidAccessTokenMock
            .mockReturnValueOnce(refreshInvalidGrant())
            .mockReturnValueOnce(Effect.succeed(ACCESS_TOKEN))
        stubAthlete(() => json({ id: 12345 }))

        const exit = await run()

        expect(successValue(exit)).toEqual({ disconnected: false })
        expect(deletes(db)).toHaveLength(0)
    })

    it('returns not disconnected for a user without a connection', async () => {
        const db = useDb()
        getValidAccessTokenMock.mockReturnValue(
            Effect.fail(
                new StravaNotConnectedError({
                    cause: 'no strava connection for user',
                    error_hash: ErrorCode.STRAVA_TOKEN_NOT_CONNECTED,
                })
            )
        )

        const exit = await run()

        expect(successValue(exit)).toEqual({ disconnected: false })
        expect(deletes(db)).toHaveLength(0)
    })

    it('keeps the connection and propagates a 429 from GET /athlete', async () => {
        const db = useDb()
        stubAthlete(() => json({}, 429, { 'Retry-After': '30' }))

        const exit = await run()

        expect(failureTag(exit)).toBe('StravaRateLimitedError')
        expect(deletes(db)).toHaveLength(0)
    })

    it('keeps the connection and propagates a 500 from GET /athlete', async () => {
        const db = useDb()
        stubAthlete(() => json({}, 500))

        const exit = await run()

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(deletes(db)).toHaveLength(0)
    })

    it('keeps the connection and propagates a rate limit or 5xx on the refresh', async () => {
        const db = useDb()
        getValidAccessTokenMock.mockReturnValueOnce(
            Effect.fail(
                new StravaRateLimitedError({
                    cause: 'HTTP 429',
                    error_hash: ErrorCode.STRAVA_OAUTH_RATE_LIMITED,
                    retryAfterS: null,
                })
            )
        )
        const limited = await run()
        expect(failureTag(limited)).toBe('StravaRateLimitedError')

        getValidAccessTokenMock.mockReturnValueOnce(
            Effect.fail(
                new StravaApiError({
                    cause: 'HTTP 503',
                    error_hash: ErrorCode.STRAVA_OAUTH_HTTP,
                    status: 503,
                })
            )
        )
        const unavailable = await run()
        expect(failureTag(unavailable)).toBe('StravaApiError')

        expect(deletes(db)).toHaveLength(0)
    })

    it('keeps the connection and propagates a network failure', async () => {
        const db = useDb()
        const fetchStub = fetchMock()
        fetchStub.mockRejectedValue(new Error(`socket closed for Bearer ${ACCESS_TOKEN}`))
        vi.stubGlobal('fetch', fetchStub)

        const exit = await run()

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(deletes(db)).toHaveLength(0)
        expect(JSON.stringify(exit)).not.toContain(ACCESS_TOKEN)
        expect(JSON.stringify(exit)).not.toContain(REFRESH_SECRET)
    })

    it('fails with CreateSbClientError when the admin client cannot be created', async () => {
        createDBAdminClientMock.mockImplementation(() => {
            throw new Error('missing key')
        })

        const exit = await run()

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})
