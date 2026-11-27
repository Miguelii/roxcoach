// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ActivityNotFoundError, ActivityWriteError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { setRunTypeMock, getSessionMock } = vi.hoisted(() => ({
    setRunTypeMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/training/services/set-run-type.service', () => ({
    setRunType: setRunTypeMock,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: getSessionMock,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-1', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})
const ID = '7a1f0f4e-3b0e-4c53-9a0a-6a3a3d2f9c11'

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('SET_RUN_TYPE_PROTECTED_CONTROLLER', () => {
    beforeEach(() => {
        setRunTypeMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('passes the signed-in user and the input to the service and returns its result', async () => {
        setRunTypeMock.mockReturnValue(Effect.succeed({ runType: 'long', runTypeManual: true }))

        await expect(
            caller.training.setRunType({ activityId: ID, runType: 'long' })
        ).resolves.toEqual({ runType: 'long', runTypeManual: true })
        expect(setRunTypeMock).toHaveBeenCalledWith(USER, { activityId: ID, runType: 'long' })
    })

    it('rejects an unknown run type and a non-uuid id before reaching the service', async () => {
        const badType = await caught(
            // @ts-expect-error an invalid run type on purpose
            caller.training.setRunType({ activityId: ID, runType: 'tempo' })
        )
        const badId = await caught(
            caller.training.setRunType({ activityId: 'not-a-uuid', runType: 'auto' })
        )

        expect(badType.code).toBe('BAD_REQUEST')
        expect(badId.code).toBe('BAD_REQUEST')
        expect(setRunTypeMock).not.toHaveBeenCalled()
    })

    it('maps not found to NOT_FOUND and a write error to INTERNAL_SERVER_ERROR', async () => {
        setRunTypeMock.mockReturnValueOnce(
            Effect.fail(
                new ActivityNotFoundError({
                    cause: 'missing',
                    error_hash: ErrorCode.TRAINING_RUN_TYPE_NOT_FOUND,
                })
            )
        )
        const missing = await caught(
            caller.training.setRunType({ activityId: ID, runType: 'fast' })
        )

        setRunTypeMock.mockReturnValueOnce(
            Effect.fail(
                new ActivityWriteError({
                    cause: 'boom',
                    error_hash: ErrorCode.TRAINING_RUN_TYPE_SET_ERR,
                })
            )
        )
        const write = await caught(caller.training.setRunType({ activityId: ID, runType: 'fast' }))

        expect(missing.code).toBe('NOT_FOUND')
        expect(write.code).toBe('INTERNAL_SERVER_ERROR')
        expect(write.message).toBe(ErrorCode.TRAINING_RUN_TYPE_SET_ERR)
    })
})
