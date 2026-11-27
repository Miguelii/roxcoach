// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { DEFAULT_WEEKLY_GOALS } from '@/_bff/core/constants/weekly-goals.constants'
import { CreateSbClientError, WeeklyGoalsQueryError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { getWeeklyGoalsMock, getSessionMock } = vi.hoisted(() => ({
    getWeeklyGoalsMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/athlete/services/get-weekly-goals.service', () => ({
    getWeeklyGoals: getWeeklyGoalsMock,
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

describe('weekly goals controllers', () => {
    beforeEach(() => {
        getWeeklyGoalsMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('getWeeklyGoals returns the goals of the signed-in user', async () => {
        getWeeklyGoalsMock.mockReturnValue(Effect.succeed(DEFAULT_WEEKLY_GOALS))

        await expect(caller.athlete.getWeeklyGoals()).resolves.toEqual(DEFAULT_WEEKLY_GOALS)
        expect(getWeeklyGoalsMock).toHaveBeenCalledWith(USER)
    })

    it.each([
        new CreateSbClientError({
            cause: 'no cookies',
            error_hash: ErrorCode.ATHLETE_GOALS_SB_CLIENT,
        }),
        new WeeklyGoalsQueryError({
            cause: '42501: denied',
            error_hash: ErrorCode.ATHLETE_GOALS_SELECT_ERR,
        }),
    ])('get controller maps %s to INTERNAL_SERVER_ERROR', async (failure) => {
        getWeeklyGoalsMock.mockReturnValue(Effect.fail(failure))

        const error = await caught(caller.athlete.getWeeklyGoals())

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
        expect(error.cause).toBeUndefined()
    })
})
