// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { startStravaConnect } from '@/_bff/modules/strava/services/start-strava-connect.service'

type CookieOptions = {
    httpOnly: boolean
    sameSite: string
    secure: boolean
    path: string
    maxAge: number
}
type StravaEnv = { NEXT_STRAVA_CLIENT_ID?: string; NEXT_STRAVA_CLIENT_SECRET?: string }

const { cookieSet, cookiesMock, env } = vi.hoisted(() => {
    const stravaEnv: StravaEnv = {}
    const set = vi.fn<(name: string, value: string, options: CookieOptions) => void>()
    return { cookieSet: set, cookiesMock: vi.fn(), env: stravaEnv }
})

vi.mock('next/headers', () => ({ cookies: cookiesMock }))
vi.mock('@/env/server', () => ({ ServerEnv: env }))

const CLIENT_SECRET = 'client-secret-xyz'

describe('startStravaConnect', () => {
    beforeEach(() => {
        env.NEXT_STRAVA_CLIENT_ID = 'client-id-1'
        env.NEXT_STRAVA_CLIENT_SECRET = CLIENT_SECRET
        cookieSet.mockReset()
        cookiesMock.mockReset().mockResolvedValue({ set: cookieSet })
    })

    it('builds the authorize url with every parameter and a state equal to the cookie set', async () => {
        const { url } = await Effect.runPromise(startStravaConnect())
        const parsed = new URL(url)

        expect(`${parsed.origin}${parsed.pathname}`).toBe('https://www.strava.com/oauth/authorize')
        expect(parsed.searchParams.get('client_id')).toBe('client-id-1')
        expect(parsed.searchParams.get('response_type')).toBe('code')
        expect(parsed.searchParams.get('redirect_uri')).toBe(
            'http://localhost:3000/api/strava/callback'
        )
        expect(parsed.searchParams.get('approval_prompt')).toBe('auto')
        expect(parsed.searchParams.get('scope')).toBe('read,activity:read_all')

        const state = parsed.searchParams.get('state')
        expect(state).toMatch(/^[0-9a-f]{64}$/u)

        expect(cookieSet).toHaveBeenCalledTimes(1)
        const [name, value, options] = cookieSet.mock.calls[0]
        expect(name).toBe('strava_oauth_state')
        expect(value).toBe(state)
        expect(options).toEqual({
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/api/strava',
            maxAge: 600,
        })
    })

    it('never puts the client secret in the url', async () => {
        const { url } = await Effect.runPromise(startStravaConnect())

        expect(url).not.toContain(CLIENT_SECRET)
    })

    it('uses a fresh state on every call', async () => {
        const first = await Effect.runPromise(startStravaConnect())
        const second = await Effect.runPromise(startStravaConnect())

        expect(new URL(first.url).searchParams.get('state')).not.toBe(
            new URL(second.url).searchParams.get('state')
        )
    })

    it('fails with StravaNotConfiguredError and sets no cookie when the client id is missing', async () => {
        env.NEXT_STRAVA_CLIENT_ID = undefined

        const exit = await Effect.runPromiseExit(startStravaConnect())

        expect(failureTag(exit)).toBe('StravaNotConfiguredError')
        expect(cookieSet).not.toHaveBeenCalled()
    })

    it('fails with StravaOAuthStateError when the cookie cannot be set', async () => {
        cookieSet.mockImplementation(() => {
            throw new Error('cookies are read-only here')
        })

        const exit = await Effect.runPromiseExit(startStravaConnect())

        expect(failureTag(exit)).toBe('StravaOAuthStateError')
    })
})
