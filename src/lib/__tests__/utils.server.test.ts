// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sbProxy } from '@/lib/utils.server'

type Claims = { sub: string; app_metadata?: Record<string, boolean | string> } | null
type SetAllHook = (
    cookiesToSet: { name: string; value: string; options: { path: string } }[],
    headers: Record<string, string>
) => void
type Hooks = { onSetAll?: SetAllHook }

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

const REFRESHED_COOKIE = { name: 'sb-test-auth-token', value: 'refreshed', options: { path: '/' } }
const NO_CACHE_HEADERS = { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' }

// Records every property read on the fake client, in order, through getters.
const accessLog: string[] = []

const mockClient = (claims: Claims, refresh = false) => {
    createDBServerClientMock.mockImplementation(async (_useSecretKey: boolean, hooks?: Hooks) => {
        const getClaims = vi.fn(async () => {
            if (refresh) hooks?.onSetAll?.([REFRESHED_COOKIE], NO_CACHE_HEADERS)
            return { data: claims ? { claims } : null, error: null }
        })
        const auth = {
            get getClaims() {
                accessLog.push('auth.getClaims')
                return getClaims
            },
        }
        return {
            get auth() {
                accessLog.push('auth')
                return auth
            },
        }
    })
}

const request = (path: string) => new NextRequest(new URL(path, 'https://roxcoach.test'))

const flagged = { sub: 'user-1', app_metadata: { roxcoach: true } }

describe('sbProxy', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        accessLog.length = 0
    })

    it('redirects to /login without claims on a protected path', async () => {
        mockClient(null)

        const response = await sbProxy(request('/dashboard'))

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('https://roxcoach.test/login')
    })

    it('redirects to /login when the claims lack the roxcoach flag', async () => {
        mockClient({ sub: 'user-1', app_metadata: { provider: 'email' } })

        const response = await sbProxy(request('/dashboard/week?x=1'))

        expect(response.headers.get('location')).toBe('https://roxcoach.test/login')
    })

    it('redirects to /login when the flag is not the strict boolean', async () => {
        mockClient({ sub: 'user-1', app_metadata: { roxcoach: 'true' } })

        const response = await sbProxy(request('/calendar'))

        expect(response.headers.get('location')).toBe('https://roxcoach.test/login')
    })

    it('redirects /login to /dashboard with the flag', async () => {
        mockClient(flagged)

        const response = await sbProxy(request('/login'))

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('https://roxcoach.test/dashboard')
    })

    it('passes /login through for a signed-in user without the flag', async () => {
        mockClient({ sub: 'user-1' })

        const response = await sbProxy(request('/login'))

        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get('x-middleware-next')).toBe('1')
    })

    it('passes a protected path through with the flag', async () => {
        mockClient(flagged)

        const response = await sbProxy(request('/dashboard'))

        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get('x-middleware-next')).toBe('1')
    })

    it('does not treat /calendarx as protected', async () => {
        mockClient(null)

        const response = await sbProxy(request('/calendarx'))

        expect(response.headers.get('location')).toBeNull()
    })

    it('calls getClaims as the first operation on the client', async () => {
        mockClient(flagged)

        await sbProxy(request('/dashboard'))

        expect(createDBServerClientMock).toHaveBeenCalledWith(false, expect.any(Object))
        expect(accessLog.slice(0, 2)).toEqual(['auth', 'auth.getClaims'])
    })

    it('puts cookies refreshed through onSetAll on the pass-through response', async () => {
        mockClient(flagged, true)

        const response = await sbProxy(request('/dashboard'))

        expect(response.cookies.get(REFRESHED_COOKIE.name)?.value).toBe('refreshed')
        expect(response.headers.get('Cache-Control')).toBe(NO_CACHE_HEADERS['Cache-Control'])
        expect(response.headers.get('x-middleware-request-cookie')).toContain(
            'sb-test-auth-token=refreshed'
        )
    })

    it.each([
        ['/login', flagged],
        ['/dashboard', { sub: 'user-1' }],
    ])('puts refreshed cookies on the redirect from %s', async (path, claims) => {
        mockClient(claims, true)

        const response = await sbProxy(request(path))

        expect(response.headers.get('location')).not.toBeNull()
        expect(response.cookies.get(REFRESHED_COOKIE.name)?.value).toBe('refreshed')
        expect(response.headers.get('Cache-Control')).toBe(NO_CACHE_HEADERS['Cache-Control'])
    })
})
