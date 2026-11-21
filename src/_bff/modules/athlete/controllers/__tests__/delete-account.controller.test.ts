// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { AccountDeletionError, CreateSbClientError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { deleteAccountMock, getSessionMock } = vi.hoisted(() => ({
    deleteAccountMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/athlete/services/delete-account.service', () => ({
    deleteAccount: deleteAccountMock,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: getSessionMock,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-1', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('DELETE_ACCOUNT_PROTECTED_CONTROLLER', () => {
    beforeEach(() => {
        deleteAccountMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('deletes the account of the signed-in user, never one passed by the client', async () => {
        deleteAccountMock.mockReturnValue(Effect.succeed({ status: 200 as const }))

        await expect(caller.athlete.deleteAccount()).resolves.toEqual({ status: 200 })
        expect(deleteAccountMock).toHaveBeenCalledWith(USER)
    })

    it('requires a signed-in user and deletes nothing without one', async () => {
        getSessionMock.mockReturnValue(Effect.succeed(null))

        const error = await caught(caller.athlete.deleteAccount())

        expect(error.code).toBe('UNAUTHORIZED')
        expect(deleteAccountMock).not.toHaveBeenCalled()
    })

    it('refuses a user without the access flag', async () => {
        getSessionMock.mockReturnValue(Effect.succeed({ id: 'user-2', app_metadata: {} }))

        const error = await caught(caller.athlete.deleteAccount())

        expect(error.code).toBe('FORBIDDEN')
        expect(deleteAccountMock).not.toHaveBeenCalled()
    })

    it.each([
        new CreateSbClientError({
            cause: 'no env',
            error_hash: ErrorCode.ATHLETE_DELETE_SB_CLIENT,
        }),
        new AccountDeletionError({
            cause: 'storage down',
            error_hash: ErrorCode.ATHLETE_DELETE_FILES_LIST_ERR,
        }),
    ])('maps %s to INTERNAL_SERVER_ERROR with only the error code', async (failure) => {
        deleteAccountMock.mockReturnValue(Effect.fail(failure))

        const error = await caught(caller.athlete.deleteAccount())

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
        expect(error.message).toBe(failure.error_hash)
    })
})
