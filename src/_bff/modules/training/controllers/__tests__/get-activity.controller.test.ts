// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ActivityQueryError, CreateSbClientError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { getActivityMock, getSessionMock } = vi.hoisted(() => ({
    getActivityMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/training/services/get-activity.service', () => ({
    getActivity: getActivityMock,
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

describe('GET_ACTIVITY_PROTECTED_CONTROLLER', () => {
    beforeEach(() => {
        getActivityMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('passes the signed-in user and the id to the service and returns its result', async () => {
        getActivityMock.mockReturnValue(Effect.succeed({ activity: { id: ID }, laps: [] }))

        await expect(caller.training.getActivity({ id: ID })).resolves.toEqual({
            activity: { id: ID },
            laps: [],
        })
        expect(getActivityMock).toHaveBeenCalledWith(USER, ID)
    })

    it('returns null for a missing activity', async () => {
        getActivityMock.mockReturnValue(Effect.succeed(null))

        await expect(caller.training.getActivity({ id: ID })).resolves.toBeNull()
    })

    it('requires a signed-in user', async () => {
        getSessionMock.mockReturnValue(Effect.succeed(null))

        const error = await caught(caller.training.getActivity({ id: ID }))

        expect(error.code).toBe('UNAUTHORIZED')
        expect(getActivityMock).not.toHaveBeenCalled()
    })

    it('rejects a non-uuid id before reaching the service', async () => {
        const error = await caught(caller.training.getActivity({ id: 'not-a-uuid' }))

        expect(error.code).toBe('BAD_REQUEST')
        expect(getActivityMock).not.toHaveBeenCalled()
    })

    it('maps ActivityQueryError and CreateSbClientError to INTERNAL_SERVER_ERROR', async () => {
        getActivityMock.mockReturnValueOnce(
            Effect.fail(
                new ActivityQueryError({
                    cause: 'boom',
                    error_hash: ErrorCode.TRAINING_ACTIVITY_BY_ID_ERR,
                })
            )
        )
        const query = await caught(caller.training.getActivity({ id: ID }))

        getActivityMock.mockReturnValueOnce(
            Effect.fail(
                new CreateSbClientError({
                    cause: 'no cookies',
                    error_hash: ErrorCode.TRAINING_SB_CLIENT,
                })
            )
        )
        const client = await caught(caller.training.getActivity({ id: ID }))

        expect(query.code).toBe('INTERNAL_SERVER_ERROR')
        expect(query.message).toBe(ErrorCode.TRAINING_ACTIVITY_BY_ID_ERR)
        expect(client.code).toBe('INTERNAL_SERVER_ERROR')
        expect(client.message).toBe(ErrorCode.TRAINING_SB_CLIENT)
    })
})
