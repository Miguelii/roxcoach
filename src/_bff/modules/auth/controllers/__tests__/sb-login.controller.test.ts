// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { router } from '@/_bff/trpc/server'
import { SB_LOGIN_PUBLIC_CONTROLLER } from '@/_bff/modules/auth/controllers/sb-login.controller'
import { AccessDeniedError, CreateSbClientError, SignInWithPasswordError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { sbLoginMock } = vi.hoisted(() => ({ sbLoginMock: vi.fn() }))

vi.mock('@/_bff/modules/auth/services/sb-login.service', () => ({ sbLogin: sbLoginMock }))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const caller = router({ login: SB_LOGIN_PUBLIC_CONTROLLER }).createCaller({})
const ERROR_HASH_PATTERN = /^[a-z0-9]{8}$/u
const credentials = { email: 'athlete@example.com', password: 'pw' }

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('SB_LOGIN_PUBLIC_CONTROLLER', () => {
    beforeEach(() => {
        sbLoginMock.mockReset()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('returns the service result on success', async () => {
        sbLoginMock.mockReturnValue(Effect.succeed({ status: 200 as const }))

        await expect(caller.login(credentials)).resolves.toEqual({ status: 200 })
        expect(sbLoginMock).toHaveBeenCalledWith('athlete@example.com', 'pw')
    })

    it('maps SignInWithPasswordError and AccessDeniedError to the same UNAUTHORIZED shape', async () => {
        sbLoginMock.mockReturnValueOnce(
            Effect.fail(
                new SignInWithPasswordError({
                    cause: 'bad password',
                    error_hash: ErrorCode.AUTH_LOGIN_SIGN_IN_ERR,
                })
            )
        )
        const wrongPassword = await caught(caller.login(credentials))

        sbLoginMock.mockReturnValueOnce(
            Effect.fail(
                new AccessDeniedError({
                    cause: 'no flag',
                    error_hash: ErrorCode.AUTH_LOGIN_NO_ACCESS,
                })
            )
        )
        const noAccess = await caught(caller.login(credentials))

        expect(wrongPassword.code).toBe('UNAUTHORIZED')
        expect(noAccess.code).toBe('UNAUTHORIZED')
        expect(wrongPassword.message).toMatch(ERROR_HASH_PATTERN)
        expect(noAccess.message).toMatch(ERROR_HASH_PATTERN)
        expect(wrongPassword.cause).toBeUndefined()
        expect(noAccess.cause).toBeUndefined()
    })

    it('maps CreateSbClientError to INTERNAL_SERVER_ERROR', async () => {
        sbLoginMock.mockReturnValue(
            Effect.fail(
                new CreateSbClientError({
                    cause: 'no env',
                    error_hash: ErrorCode.AUTH_LOGIN_SB_CLIENT,
                })
            )
        )

        const error = await caught(caller.login(credentials))

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
    })

    it('rejects an invalid email before reaching the service', async () => {
        const error = await caught(caller.login({ email: 'not-an-email', password: 'pw' }))

        expect(error.code).toBe('BAD_REQUEST')
        expect(sbLoginMock).not.toHaveBeenCalled()
    })

    it('rejects an empty password', async () => {
        const error = await caught(caller.login({ email: 'athlete@example.com', password: '' }))

        expect(error.code).toBe('BAD_REQUEST')
        expect(sbLoginMock).not.toHaveBeenCalled()
    })
})
