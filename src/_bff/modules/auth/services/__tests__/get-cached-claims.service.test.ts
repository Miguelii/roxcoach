import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCachedClaims } from '@/_bff/modules/auth/services/get-cached-claims.service'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({
    createDBServerClient: createDBServerClientMock,
}))
// The request cache is a pass-through here so each test sees a fresh lookup
vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))

const getClaims = vi.fn()
// Raw JWT claims as the fake client returns them: every field may be malformed
type Claims = {
    sub?: string
    email?: string | number
    user_metadata?: string | { full_name?: string | { nested: boolean } }
    app_metadata?: { roxcoach?: string | boolean; roxcoach_admin?: string | boolean }
}

const withClaims = (claims: Claims) => getClaims.mockResolvedValue({ data: { claims } })

describe('getCachedClaims', () => {
    beforeEach(() => {
        getClaims.mockReset()
        createDBServerClientMock.mockReset().mockResolvedValue({ auth: { getClaims } })
    })

    it('maps valid claims to the session claims', async () => {
        withClaims({
            sub: 'user-1',
            email: 'athlete@example.com',
            user_metadata: { full_name: 'Alex Runner' },
            app_metadata: { roxcoach: true },
        })

        expect(await getCachedClaims()).toEqual({
            userId: 'user-1',
            email: 'athlete@example.com',
            fullName: 'Alex Runner',
            hasAccess: true,
            isAdmin: false,
        })
    })

    it('sets isAdmin with the strict boolean admin flag', async () => {
        withClaims({ sub: 'user-1', app_metadata: { roxcoach: true, roxcoach_admin: true } })

        expect(await getCachedClaims()).toMatchObject({ hasAccess: true, isAdmin: true })
    })

    it('sets isAdmin to false when the admin flag is a string', async () => {
        withClaims({ sub: 'user-1', app_metadata: { roxcoach: true, roxcoach_admin: 'true' } })

        expect(await getCachedClaims()).toMatchObject({ isAdmin: false })
    })

    it('reads a malformed email as null', async () => {
        withClaims({ sub: 'user-1', email: 42, user_metadata: { full_name: 'Alex' } })

        expect(await getCachedClaims()).toMatchObject({ userId: 'user-1', email: null })
    })

    it('reads malformed user_metadata as null', async () => {
        withClaims({ sub: 'user-1', email: 'a@example.com', user_metadata: 'oops' })

        expect(await getCachedClaims()).toMatchObject({ fullName: null })
    })

    it('reads a malformed full_name as null', async () => {
        withClaims({ sub: 'user-1', user_metadata: { full_name: { nested: true } } })

        expect(await getCachedClaims()).toMatchObject({ fullName: null })
    })

    it('returns null when sub is missing', async () => {
        withClaims({ email: 'a@example.com' })

        expect(await getCachedClaims()).toBeNull()
    })

    it('returns null when there are no claims', async () => {
        getClaims.mockResolvedValue({ data: null })

        expect(await getCachedClaims()).toBeNull()
    })

    it.each([
        ['missing', {}],
        ['a string', { roxcoach: 'true' }],
        ['false', { roxcoach: false }],
    ])('sets hasAccess to false when the flag is %s', async (_label, appMetadata) => {
        withClaims({ sub: 'user-1', app_metadata: appMetadata })

        expect(await getCachedClaims()).toMatchObject({ hasAccess: false })
    })

    it('sets hasAccess to false when app_metadata is absent', async () => {
        withClaims({ sub: 'user-1' })

        expect(await getCachedClaims()).toMatchObject({ hasAccess: false })
    })

    it('returns null when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no env'))

        expect(await getCachedClaims()).toBeNull()
    })
})
