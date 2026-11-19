// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { proxy } from '@/proxy'

type Claims = { sub: string; app_metadata?: Record<string, boolean> } | null
type SetAllHook = (
    cookiesToSet: { name: string; value: string; options: { path: string } }[],
    headers: Record<string, string>
) => void
type Hooks = { onSetAll?: SetAllHook }

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

const SUPABASE_NO_STORE = 'private, no-cache, no-store, must-revalidate, max-age=0'

// Fake client whose getClaims refreshes the session the way @supabase/ssr does.
const mockRefreshingClient = (claims: Claims) => {
    createDBServerClientMock.mockImplementation(async (_useSecretKey: boolean, hooks?: Hooks) => ({
        auth: {
            getClaims: async () => {
                hooks?.onSetAll?.(
                    [{ name: 'sb-test-auth-token', value: 'refreshed', options: { path: '/' } }],
                    { 'Cache-Control': SUPABASE_NO_STORE, Expires: '0', Pragma: 'no-cache' }
                )
                return { data: claims ? { claims } : null, error: null }
            },
        },
    }))
}

const request = (path: string) => new NextRequest(new URL(path, 'https://roxcoach.test'))

describe('proxy', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it.each([
        ['a pass-through', '/dashboard', { sub: 'user-1', app_metadata: { roxcoach: true } }],
        ['a redirect', '/dashboard', null],
    ])('keeps Supabase no-store on %s that refreshes the session', async (_label, path, claims) => {
        mockRefreshingClient(claims)

        const response = await proxy(request(path))

        expect(response.headers.get('set-cookie')).toContain('sb-test-auth-token=refreshed')
        expect(response.headers.get('Cache-Control')).toBe(SUPABASE_NO_STORE)
        expect(response.headers.get('Cache-Control')).not.toContain('public')
        expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    })
})
