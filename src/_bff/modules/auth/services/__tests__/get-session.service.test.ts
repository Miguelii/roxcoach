import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import { failureTag } from '@/_bff/lib/tests-utils'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({
    createDBServerClient: createDBServerClientMock,
}))
// The request cache is a pass-through here so each test sees a fresh lookup
vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))

const getUser = vi.fn()

describe('getSession', () => {
    beforeEach(() => {
        getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
        createDBServerClientMock.mockReset().mockResolvedValue({ auth: { getUser } })
    })

    it('returns the signed-in user', async () => {
        const user = await Effect.runPromise(getSession())

        expect(user).toEqual({ id: 'user-1' })
    })

    it('returns null when getUser reports an auth error', async () => {
        getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })

        const user = await Effect.runPromise(getSession())

        expect(user).toBeNull()
    })

    it('fails with GetUserError when getUser throws', async () => {
        getUser.mockRejectedValue(new Error('network down'))

        const exit = await Effect.runPromiseExit(getSession())
        expect(failureTag(exit)).toBe('GetUserError')
    })

    it('fails with CreateSbClientError when the Supabase client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no env'))

        const exit = await Effect.runPromiseExit(getSession())
        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})
