import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { Logger } from '@/_bff/lib/server-logger'
import { sbSignUp, type SignUpDeps } from '@/_bff/modules/auth/services/sb-sign-up.service'

vi.mock('@/_bff/lib/server-logger', () => ({ Logger: vi.fn() }))

const CODE = 'a-very-long-access-code'
const input = {
    displayName: 'Ana Silva',
    email: 'ana.silva@example.com',
    password: 'secret-password',
    accessCode: CODE,
}

const createUser = vi.fn()
const deleteUser = vi.fn()
const rpc = vi.fn()
const signInWithPassword = vi.fn()
const createAdminClient = vi.fn()
const createServerClient = vi.fn()

// SAFETY: the fakes implement only the client methods the service calls.
const makeDeps = (expectedCode: string | null = CODE): SignUpDeps => ({
    expectedCode: expectedCode ?? undefined,
    createAdminClient: createAdminClient as never,
    createServerClient: createServerClient as never,
})

const run = (override: Partial<typeof input> = {}) =>
    Effect.runPromiseExit(sbSignUp({ ...input, ...override }, makeDeps()))

describe('sbSignUp', () => {
    beforeEach(() => {
        createUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
        deleteUser.mockReset().mockResolvedValue({ error: null })
        rpc.mockReset().mockResolvedValue({ error: null })
        signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null })
        createAdminClient
            .mockReset()
            .mockReturnValue({ auth: { admin: { createUser, deleteUser } }, rpc })
        createServerClient.mockReset().mockResolvedValue({ auth: { signInWithPassword } })
        vi.mocked(Logger).mockClear()
    })

    it('creates a confirmed user, grants access and signs in', async () => {
        const exit = await run()

        expect(failureTag(exit)).toBeNull()
        expect(createUser).toHaveBeenCalledTimes(1)
        const [args] = createUser.mock.calls[0]
        expect(args).toEqual({
            email: input.email,
            password: input.password,
            email_confirm: true,
        })
        expect(args).not.toHaveProperty('app_metadata')
        expect(rpc).toHaveBeenCalledWith('grant_access', {
            p_user_id: 'user-1',
            p_display_name: 'Ana Silva',
        })
        expect(signInWithPassword).toHaveBeenCalledTimes(1)
        expect(signInWithPassword).toHaveBeenCalledWith({
            email: input.email,
            password: input.password,
        })
        expect(deleteUser).not.toHaveBeenCalled()
    })

    it('trims the access code the user typed', async () => {
        expect(failureTag(await run({ accessCode: `  ${CODE} ` }))).toBeNull()
    })

    it('trims the display name', async () => {
        await run({ displayName: '  Ana Silva  ' })

        expect(rpc).toHaveBeenCalledWith('grant_access', {
            p_user_id: 'user-1',
            p_display_name: 'Ana Silva',
        })
    })

    it('fails with SignUpClosedError and touches nothing when the code is not configured', async () => {
        const exit = await Effect.runPromiseExit(sbSignUp(input, makeDeps(null)))

        expect(failureTag(exit)).toBe('SignUpClosedError')
        expect(createAdminClient).not.toHaveBeenCalled()
        expect(createUser).not.toHaveBeenCalled()
    })

    it('fails with InvalidAccessCodeError and makes no Supabase call for a bad code', async () => {
        const exit = await run({ accessCode: 'wrong-code-wrong-code' })

        expect(failureTag(exit)).toBe('InvalidAccessCodeError')
        expect(createAdminClient).not.toHaveBeenCalled()
        expect(createServerClient).not.toHaveBeenCalled()
        expect(createUser).not.toHaveBeenCalled()
    })

    it('fails with CreateUserError and grants nothing when the user cannot be created', async () => {
        createUser.mockResolvedValue({ data: { user: null }, error: { message: 'taken' } })

        const exit = await run()

        expect(failureTag(exit)).toBe('CreateUserError')
        expect(rpc).not.toHaveBeenCalled()
        expect(deleteUser).not.toHaveBeenCalled()
        expect(signInWithPassword).not.toHaveBeenCalled()
    })

    it('fails with CreateUserError when the request throws', async () => {
        createUser.mockRejectedValue(new Error('network'))

        expect(failureTag(await run())).toBe('CreateUserError')
    })

    it.each([
        [
            'returns an error',
            () => rpc.mockResolvedValue({ error: { code: 'x', message: 'boom' } }),
        ],
        ['throws', () => rpc.mockRejectedValue(new Error('network'))],
    ])('deletes the new user when the grant %s', async (_name, arrange) => {
        arrange()

        const exit = await run()

        expect(failureTag(exit)).toBe('GrantAccessError')
        expect(deleteUser).toHaveBeenCalledWith('user-1')
        expect(signInWithPassword).not.toHaveBeenCalled()
    })

    it('still fails with GrantAccessError and logs when the cleanup fails too', async () => {
        rpc.mockResolvedValue({ error: { code: 'x', message: 'boom' } })
        deleteUser.mockResolvedValue({ error: { message: 'cannot delete' } })

        const exit = await run()

        expect(failureTag(exit)).toBe('GrantAccessError')
        expect(Logger).toHaveBeenCalledTimes(1)
        const logged = JSON.stringify(vi.mocked(Logger).mock.calls)
        expect(logged).not.toContain(CODE)
        expect(logged).not.toContain(input.password)
    })

    it('keeps the granted user when the final sign-in fails', async () => {
        signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'nope' } })

        const exit = await run()

        expect(failureTag(exit)).toBe('SignInWithPasswordError')
        expect(deleteUser).not.toHaveBeenCalled()
    })

    it('fails with CreateSbClientError when a client cannot be created', async () => {
        createAdminClient.mockImplementation(() => {
            throw new Error('no env')
        })

        expect(failureTag(await run())).toBe('CreateSbClientError')
    })
})
