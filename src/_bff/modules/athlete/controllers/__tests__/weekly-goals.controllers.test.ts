// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { DEFAULT_WEEKLY_GOALS } from '@/_bff/core/constants/weekly-goals.constants'
import {
    ActivityQueryError,
    ActivityWriteError,
    CreateSbClientError,
    WeeklyGoalsQueryError,
    WeeklyGoalsValidationError,
} from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { getWeeklyGoalsMock, saveWeeklyGoalsMock, getSessionMock } = vi.hoisted(() => ({
    getWeeklyGoalsMock: vi.fn(),
    saveWeeklyGoalsMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/athlete/services/get-weekly-goals.service', () => ({
    getWeeklyGoals: getWeeklyGoalsMock,
}))
vi.mock('@/_bff/modules/athlete/services/save-weekly-goals.service', () => ({
    saveWeeklyGoals: saveWeeklyGoalsMock,
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
        saveWeeklyGoalsMock.mockReset()
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
    it('saveWeeklyGoals returns the goals and the reclassified count', async () => {
        saveWeeklyGoalsMock.mockReturnValue(
            Effect.succeed({ goals: DEFAULT_WEEKLY_GOALS, reclassified: 2 })
        )

        await expect(caller.athlete.saveWeeklyGoals(DEFAULT_WEEKLY_GOALS)).resolves.toEqual({
            goals: DEFAULT_WEEKLY_GOALS,
            reclassified: 2,
        })
        expect(saveWeeklyGoalsMock).toHaveBeenCalledWith(USER, DEFAULT_WEEKLY_GOALS)
    })

    it('save controller rejects an input outside the field ranges', async () => {
        const error = await caught(
            caller.athlete.saveWeeklyGoals({ ...DEFAULT_WEEKLY_GOALS, longRunsPerWeek: 8 })
        )

        expect(error.code).toBe('BAD_REQUEST')
        expect(saveWeeklyGoalsMock).not.toHaveBeenCalled()
    })

    it.each([
        [
            'BAD_REQUEST',
            new WeeklyGoalsValidationError({
                cause: 'shortRunMaxM',
                error_hash: ErrorCode.ATHLETE_GOALS_INVALID,
                field: 'shortRunMaxM',
            }),
        ],
        [
            'INTERNAL_SERVER_ERROR',
            new CreateSbClientError({
                cause: 'no cookies',
                error_hash: ErrorCode.ATHLETE_GOALS_SB_CLIENT,
            }),
        ],
        [
            'INTERNAL_SERVER_ERROR',
            new WeeklyGoalsQueryError({
                cause: '42501: denied',
                error_hash: ErrorCode.ATHLETE_GOALS_UPSERT_ERR,
            }),
        ],
        [
            'INTERNAL_SERVER_ERROR',
            new ActivityQueryError({
                cause: 'down',
                error_hash: ErrorCode.ATHLETE_GOALS_SB_CLIENT,
            }),
        ],
        [
            'INTERNAL_SERVER_ERROR',
            new ActivityWriteError({
                cause: 'down',
                error_hash: ErrorCode.ATHLETE_GOALS_SB_CLIENT,
            }),
        ],
    ])('save controller maps to %s', async (code, failure) => {
        saveWeeklyGoalsMock.mockReturnValue(Effect.fail(failure))

        const error = await caught(caller.athlete.saveWeeklyGoals(DEFAULT_WEEKLY_GOALS))

        expect(error.code).toBe(code)
        expect(error.cause).toBeUndefined()
    })
})
