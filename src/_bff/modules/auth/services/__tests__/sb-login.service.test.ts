import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { sbLogin } from '@/_bff/modules/auth/services/sb-login.service'
import { failureTag } from '@/_bff/lib/tests-utils'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({
    createDBServerClient: createDBServerClientMock,
}))

const signInWithPassword = vi.fn()
const signOut = vi.fn()
const makeClient = () => ({ auth: { signInWithPassword, signOut } })

describe('sbLogin', () => {
    beforeEach(() => {
        signInWithPassword.mockReset().mockResolvedValue({
            data: { user: { app_metadata: { roxcoach: true } } },
            error: null,
        })
        signOut.mockReset().mockResolvedValue({ error: null })
        createDBServerClientMock.mockReset().mockResolvedValue(makeClient())
    })

    it('signs in with the provided credentials', async () => {
        const result = await Effect.runPromise(sbLogin('user@example.com', 'secret'))

        expect(result).toEqual({ status: 200 })
        expect(signInWithPassword).toHaveBeenCalledWith({
            email: 'user@example.com',
            password: 'secret',
        })
        expect(signOut).not.toHaveBeenCalled()
    })

    it('fails with SignInWithPasswordError when Supabase rejects the credentials', async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: null },
            error: { message: 'invalid credentials' },
        })

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'wrong'))
        expect(failureTag(exit)).toBe('SignInWithPasswordError')
    })

    it('fails with SignInWithPasswordError when the request rejects', async () => {
        signInWithPassword.mockRejectedValue(new Error('network down'))

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'secret'))
        expect(failureTag(exit)).toBe('SignInWithPasswordError')
    })

    it('signs out and fails with AccessDeniedError when the user lacks the roxcoach flag', async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: { app_metadata: { brewstock: true } } },
            error: null,
        })

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'secret'))
        expect(failureTag(exit)).toBe('AccessDeniedError')
        expect(signOut).toHaveBeenCalledTimes(1)
    })

    it('fails with AccessDeniedError when the flag is not a strict boolean', async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: { app_metadata: { roxcoach: 'true' } } },
            error: null,
        })

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'secret'))
        expect(failureTag(exit)).toBe('AccessDeniedError')
        expect(signOut).toHaveBeenCalledTimes(1)
    })

    it('still fails with AccessDeniedError when the cleanup sign-out fails', async () => {
        signInWithPassword.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
        signOut.mockRejectedValue(new Error('network down'))

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'secret'))
        expect(failureTag(exit)).toBe('AccessDeniedError')
    })

    it('fails with CreateSbClientError when the Supabase client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no env'))

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'secret'))
        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})
