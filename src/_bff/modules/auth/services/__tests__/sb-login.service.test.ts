import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { sbLogin } from '@/_bff/modules/auth/services/sb-login.service'
import { failureTag } from '@/_bff/lib/tests-utils'
import { Logger } from '@/_bff/lib/server-logger'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({
    createDBServerClient: createDBServerClientMock,
}))
vi.mock('@/_bff/lib/server-logger', () => ({ Logger: vi.fn() }))

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
        vi.mocked(Logger).mockClear()
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
        expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(Logger).not.toHaveBeenCalled()
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

    it('still fails with AccessDeniedError and logs when the cleanup sign-out throws', async () => {
        signInWithPassword.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
        const thrown = new Error('network down')
        signOut.mockRejectedValue(thrown)

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'secret'))
        expect(failureTag(exit)).toBe('AccessDeniedError')
        expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(Logger).toHaveBeenCalledWith({
            level: 'error',
            prefix: 'sbLogin.cleanupSignOut',
            error: thrown,
        })
    })

    it('still fails with AccessDeniedError and logs when the cleanup sign-out returns an error', async () => {
        signInWithPassword.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
        const returned = { message: 'revoke failed' }
        signOut.mockResolvedValue({ error: returned })

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'secret'))
        expect(failureTag(exit)).toBe('AccessDeniedError')
        expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(Logger).toHaveBeenCalledWith({
            level: 'error',
            prefix: 'sbLogin.cleanupSignOut',
            error: returned,
        })
    })

    it('never leaks the password through the wrong-password failure', async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: null },
            error: { message: 'invalid credentials' },
        })

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'hunter2-secret'))

        expect(JSON.stringify(exit)).not.toContain('hunter2-secret')
    })

    it('never leaks the password through the access-denied failure', async () => {
        signInWithPassword.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'hunter2-secret'))

        expect(JSON.stringify(exit)).not.toContain('hunter2-secret')
        expect(JSON.stringify(exit)).toContain('AccessDeniedError')
    })

    it('fails with CreateSbClientError when the Supabase client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no env'))

        const exit = await Effect.runPromiseExit(sbLogin('user@example.com', 'secret'))
        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})
