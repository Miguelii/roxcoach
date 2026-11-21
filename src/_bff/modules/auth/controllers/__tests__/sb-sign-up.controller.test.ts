// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { router } from '@/_bff/trpc/server'
import { SB_SIGN_UP_PUBLIC_CONTROLLER } from '@/_bff/modules/auth/controllers/sb-sign-up.controller'
import {
    CreateSbClientError,
    CreateUserError,
    GrantAccessError,
    InvalidAccessCodeError,
    SignInWithPasswordError,
    SignUpClosedError,
} from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { sbSignUpMock } = vi.hoisted(() => ({ sbSignUpMock: vi.fn() }))

vi.mock('@/_bff/modules/auth/services/sb-sign-up.service', () => ({ sbSignUp: sbSignUpMock }))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const caller = router({ signUp: SB_SIGN_UP_PUBLIC_CONTROLLER }).createCaller({})
const valid = {
    displayName: 'Ana',
    email: 'ana@example.com',
    password: 'secret-password',
    accessCode: 'some-code',
}

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

const failures = [
    new SignUpClosedError({ cause: 'closed', error_hash: ErrorCode.AUTH_SIGNUP_CLOSED }),
    new InvalidAccessCodeError({ cause: 'bad', error_hash: ErrorCode.AUTH_SIGNUP_BAD_CODE }),
    new CreateUserError({ cause: 'taken', error_hash: ErrorCode.AUTH_SIGNUP_CREATE_USER_ERR }),
    new GrantAccessError({ cause: 'grant', error_hash: ErrorCode.AUTH_SIGNUP_GRANT_ERR }),
    new SignInWithPasswordError({ cause: 'sign in', error_hash: ErrorCode.AUTH_SIGNUP_SIGN_IN }),
]

describe('SB_SIGN_UP_PUBLIC_CONTROLLER', () => {
    beforeEach(() => {
        sbSignUpMock.mockReset()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns the service result on success', async () => {
        sbSignUpMock.mockReturnValue(Effect.succeed({ status: 200 as const }))

        await expect(caller.signUp(valid)).resolves.toEqual({ status: 200 })
        expect(sbSignUpMock).toHaveBeenCalledWith(valid)
    })

    it('gives every refusal the same code and message', async () => {
        const results: TRPCError[] = []
        for (const failure of failures) {
            sbSignUpMock.mockReturnValueOnce(Effect.fail(failure))
            results.push(await caught(caller.signUp(valid)))
        }

        for (const error of results) {
            expect(error.code).toBe('UNAUTHORIZED')
            expect(error.message).toBe(ErrorCode.AUTH_SIGNUP_FAILED)
            expect(error.cause).toBeUndefined()
        }
    })

    it('maps CreateSbClientError to INTERNAL_SERVER_ERROR', async () => {
        sbSignUpMock.mockReturnValue(
            Effect.fail(
                new CreateSbClientError({
                    cause: 'no env',
                    error_hash: ErrorCode.AUTH_SIGNUP_SB_CLIENT,
                })
            )
        )

        const error = await caught(caller.signUp(valid))

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
        expect(error.message).toBe(ErrorCode.AUTH_SIGNUP_SB_CLIENT)
    })

    it.each([
        ['a bad email', { ...valid, email: 'nope' }],
        ['a 7 character password', { ...valid, password: '1234567' }],
        ['a 73 character password', { ...valid, password: 'a'.repeat(73) }],
        ['an empty access code', { ...valid, accessCode: '' }],
        ['a blank name', { ...valid, displayName: '   ' }],
        ['a 61 character name', { ...valid, displayName: 'a'.repeat(61) }],
    ])('rejects %s before reaching the service', async (_name, input) => {
        const error = await caught(caller.signUp(input))

        expect(error.code).toBe('BAD_REQUEST')
        expect(sbSignUpMock).not.toHaveBeenCalled()
    })
})
