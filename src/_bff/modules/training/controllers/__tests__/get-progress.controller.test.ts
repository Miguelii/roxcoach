// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import {
    ActivityQueryError,
    CreateSbClientError,
    ProfileQueryError,
    RaceQueryError,
} from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { runMock, strengthMock, getSessionMock } = vi.hoisted(() => ({
    runMock: vi.fn(),
    strengthMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/training/services/get-run-progress.service', () => ({
    getRunProgress: runMock,
}))
vi.mock('@/_bff/modules/training/services/get-strength-progress.service', () => ({
    getStrengthProgress: strengthMock,
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

const ERRORS = [
    new CreateSbClientError({ cause: 'x', error_hash: ErrorCode.TRAINING_SB_CLIENT }),
    new ActivityQueryError({ cause: 'x', error_hash: ErrorCode.TRAINING_RUN_PROGRESS_SELECT_ERR }),
    new ProfileQueryError({ cause: 'x', error_hash: ErrorCode.ATHLETE_PROFILE_SELECT_ERR }),
    new RaceQueryError({ cause: 'x', error_hash: ErrorCode.RACES_SELECT_ERR }),
]

describe('progress controllers', () => {
    beforeEach(() => {
        runMock.mockReset()
        strengthMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('passes the user and range to the run service and returns its result', async () => {
        runMock.mockReturnValue(Effect.succeed({ range: '3m' }))

        await expect(caller.training.getRunProgress({ range: '3m' })).resolves.toEqual({
            range: '3m',
        })
        expect(runMock).toHaveBeenCalledWith(USER, '3m')
    })

    it('passes the user and range to the strength service and returns its result', async () => {
        strengthMock.mockReturnValue(Effect.succeed({ range: '12m' }))

        await expect(caller.training.getStrengthProgress({ range: '12m' })).resolves.toEqual({
            range: '12m',
        })
        expect(strengthMock).toHaveBeenCalledWith(USER, '12m')
    })

    it('requires a signed-in user', async () => {
        getSessionMock.mockReturnValue(Effect.succeed(null))

        expect((await caught(caller.training.getRunProgress({ range: '3m' }))).code).toBe(
            'UNAUTHORIZED'
        )
        expect(runMock).not.toHaveBeenCalled()
    })

    it.each(['1m', '', 'all'])('rejects the invalid range %j before the service', async (range) => {
        // SAFETY: deliberately invalid input to exercise the zod enum.
        const input = { range } as never
        expect((await caught(caller.training.getRunProgress(input))).code).toBe('BAD_REQUEST')
        expect((await caught(caller.training.getStrengthProgress(input))).code).toBe('BAD_REQUEST')
        expect(runMock).not.toHaveBeenCalled()
        expect(strengthMock).not.toHaveBeenCalled()
    })

    it.each(ERRORS.map((error) => [error._tag, error] as const))(
        'maps %s to INTERNAL_SERVER_ERROR on both queries',
        async (_tag, error) => {
            runMock.mockReturnValue(Effect.fail(error))
            strengthMock.mockReturnValue(Effect.fail(error))

            const run = await caught(caller.training.getRunProgress({ range: '3m' }))
            const strength = await caught(caller.training.getStrengthProgress({ range: '3m' }))

            expect(run.code).toBe('INTERNAL_SERVER_ERROR')
            expect(run.message).toBe(error.error_hash)
            expect(strength.code).toBe('INTERNAL_SERVER_ERROR')
        }
    )
})
