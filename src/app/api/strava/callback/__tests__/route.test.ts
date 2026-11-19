// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { NextRequest } from 'next/server'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { StravaApiError, StravaOAuthStateError, StravaUnauthorizedError } from '@/_bff/lib/errors'
import { GET } from '@/app/api/strava/callback/route'

type Flags = { roxcoach?: boolean | string }
type SessionUser = { id: string; app_metadata?: Flags; user_metadata?: Flags }

const { completeStravaConnectMock, createDBServerClientMock, getUser } = vi.hoisted(() => ({
    completeStravaConnectMock: vi.fn(),
    createDBServerClientMock: vi.fn(),
    getUser: vi.fn(),
}))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))
vi.mock('@/_bff/modules/strava/services/complete-strava-connect.service', () => ({
    completeStravaConnect: completeStravaConnectMock,
}))

const SITE = 'http://localhost:3000'
const STATE = 'f'.repeat(64)
const CODE = 'auth-code-123'
const USER: SessionUser = { id: 'user-1', app_metadata: { roxcoach: true } }

const request = (query: string, cookie: string | null = `strava_oauth_state=${STATE}`) =>
    new NextRequest(`${SITE}/api/strava/callback?${query}`, {
        headers: cookie === null ? {} : { cookie },
    })

const signedIn = (user: SessionUser | null) =>
    getUser.mockResolvedValue({ data: { user }, error: user === null ? { message: 'no' } : null })

const expectStateCookieCleared = (response: Response) => {
    const header = response.headers.get('set-cookie') ?? ''
    expect(header).toContain('strava_oauth_state=;')
    expect(header).toContain('Path=/api/strava')
    expect(header).toMatch(/Max-Age=0/u)
    expect(header).toContain('HttpOnly')
    expect(header.toLowerCase()).toContain('samesite=lax')
}

describe('GET /api/strava/callback', () => {
    beforeEach(() => {
        completeStravaConnectMock.mockReset().mockReturnValue(Effect.succeed('connected'))
        getUser.mockReset()
        createDBServerClientMock.mockReset().mockResolvedValue({ auth: { getUser } })
        signedIn(USER)
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('redirects to /login and exchanges nothing without a session', async () => {
        signedIn(null)

        const response = await GET(
            request(`code=${CODE}&scope=read,activity:read_all&state=${STATE}`)
        )

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe(`${SITE}/login`)
        expect(completeStravaConnectMock).not.toHaveBeenCalled()
        expectStateCookieCleared(response)
    })

    it.each([
        ['no app_metadata.roxcoach', { id: 'user-2', app_metadata: {} }],
        ['a non-boolean flag', { id: 'user-2', app_metadata: { roxcoach: 'true' } }],
        ['the flag only in user_metadata', { id: 'user-2', user_metadata: { roxcoach: true } }],
    ])(
        'redirects to /login and exchanges nothing for a session with %s',
        async (_label, user: SessionUser) => {
            signedIn(user)

            const response = await GET(
                request(`code=${CODE}&scope=read,activity:read_all&state=${STATE}`)
            )

            expect(response.headers.get('location')).toBe(`${SITE}/login`)
            expect(completeStravaConnectMock).not.toHaveBeenCalled()
            expectStateCookieCleared(response)
        }
    )

    it('redirects to /login when the session cannot be read', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no env'))

        const response = await GET(request(`code=${CODE}&state=${STATE}`))

        expect(response.headers.get('location')).toBe(`${SITE}/login`)
        expect(completeStravaConnectMock).not.toHaveBeenCalled()
        expectStateCookieCleared(response)
    })

    it('reads the session with getUser and passes the query and the cookie to the service', async () => {
        await GET(
            request(`code=${CODE}&scope=read,activity:read_all&state=${STATE}&userId=attacker`)
        )

        expect(getUser).toHaveBeenCalledTimes(1)
        expect(completeStravaConnectMock).toHaveBeenCalledWith({
            userId: USER.id,
            code: CODE,
            scope: 'read,activity:read_all',
            state: STATE,
            error: null,
            stateCookie: STATE,
        })
    })

    it('passes null for a missing cookie and missing parameters', async () => {
        await GET(request('error=access_denied', null))

        expect(completeStravaConnectMock).toHaveBeenCalledWith({
            userId: USER.id,
            code: null,
            scope: null,
            state: null,
            error: 'access_denied',
            stateCookie: null,
        })
    })

    it.each(['connected', 'denied', 'scope'])(
        'redirects to /settings?strava=%s and clears the state cookie',
        async (outcome) => {
            completeStravaConnectMock.mockReturnValue(Effect.succeed(outcome))

            const response = await GET(request(`code=${CODE}&state=${STATE}`))

            expect(response.status).toBe(307)
            expect(response.headers.get('location')).toBe(`${SITE}/settings?strava=${outcome}`)
            expectStateCookieCleared(response)
        }
    )

    it.each([
        [
            'a state mismatch',
            new StravaOAuthStateError({
                cause: 'state mismatch',
                error_hash: ErrorCode.STRAVA_CONNECT_STATE_MISMATCH,
            }),
        ],
        [
            'a replayed code',
            new StravaApiError({
                cause: 'HTTP 400',
                error_hash: ErrorCode.STRAVA_OAUTH_HTTP,
                status: 400,
            }),
        ],
        [
            'a 401 from Strava',
            new StravaUnauthorizedError({
                cause: 'HTTP 401',
                error_hash: ErrorCode.STRAVA_OAUTH_UNAUTHORIZED,
                status: 401,
            }),
        ],
    ])('redirects to /settings?strava=error on %s without any detail', async (_label, failure) => {
        completeStravaConnectMock.mockReturnValue(Effect.fail(failure))

        const response = await GET(request(`code=${CODE}&state=${STATE}`))

        const location = response.headers.get('location')
        expect(location).toBe(`${SITE}/settings?strava=error`)
        expect(location).not.toContain(CODE)
        expect(location).not.toContain(failure.error_hash)
        expectStateCookieCleared(response)
    })

    it('redirects to /settings?strava=error on a defect', async () => {
        completeStravaConnectMock.mockReturnValue(Effect.die(new Error('bug')))

        const response = await GET(request(`code=${CODE}&state=${STATE}`))

        expect(response.headers.get('location')).toBe(`${SITE}/settings?strava=error`)
        expectStateCookieCleared(response)
    })
})
