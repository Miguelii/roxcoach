// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { AccessDeniedError, SignInWithPasswordError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { getCachedClaimsMock } = vi.hoisted(() => ({ getCachedClaimsMock: vi.fn() }))

vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: getCachedClaimsMock,
}))

const PASSWORD = 'hunter2-super-secret'

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('runEffect', () => {
    const errorSpy = vi.spyOn(console, 'error')

    beforeEach(() => {
        getCachedClaimsMock.mockReset().mockResolvedValue({ userId: 'user-1' })
        errorSpy.mockReset().mockImplementation(() => {})
    })

    afterEach(() => {
        errorSpy.mockClear()
    })

    it('returns the value of a successful effect', async () => {
        const value = await runEffect(Effect.succeed({ status: 200 }), 'test', () => 'FORBIDDEN')

        expect(value).toEqual({ status: 200 })
    })

    it('maps a failure through mapCode and uses the error_hash as message', async () => {
        const effect = Effect.fail(
            new AccessDeniedError({ cause: 'no flag', error_hash: ErrorCode.AUTH_LOGIN_NO_ACCESS })
        )

        const error = await caught(runEffect(effect, 'test', () => 'UNAUTHORIZED'))

        expect(error.code).toBe('UNAUTHORIZED')
        expect(error.message).toBe(ErrorCode.AUTH_LOGIN_NO_ACCESS)
    })

    it('turns a defect into INTERNAL_SERVER_ERROR with unexpected_defect', async () => {
        const effect = Effect.die(new Error('boom'))

        const error = await caught(runEffect(effect, 'test', () => 'FORBIDDEN'))

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
        expect(error.message).toBe('unexpected_defect')
        expect(error.cause).toBeUndefined()
    })

    it('never forwards the cause to the client', async () => {
        const effect = Effect.fail(
            new SignInWithPasswordError({
                cause: { password: PASSWORD, message: 'invalid' },
                error_hash: ErrorCode.AUTH_LOGIN_SIGN_IN_ERR,
            })
        )

        const error = await caught(runEffect(effect, 'test', () => 'UNAUTHORIZED'))

        expect(error.cause).toBeUndefined()
        expect(JSON.stringify({ message: error.message, code: error.code })).not.toContain(PASSWORD)
    })

    it('never logs a password held in the cause', async () => {
        const effect = Effect.fail(
            new SignInWithPasswordError({
                cause: { password: PASSWORD, message: 'invalid' },
                error_hash: ErrorCode.AUTH_LOGIN_SIGN_IN_ERR,
            })
        )

        await caught(runEffect(effect, 'test', () => 'UNAUTHORIZED'))

        expect(errorSpy).toHaveBeenCalled()
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(PASSWORD)
    })
})
