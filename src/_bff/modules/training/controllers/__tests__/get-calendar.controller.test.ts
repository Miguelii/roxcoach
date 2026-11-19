// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ActivityQueryError, CreateSbClientError, InvalidDateRangeError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { getCalendarMock, getSessionMock } = vi.hoisted(() => ({
    getCalendarMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/training/services/get-calendar.service', () => ({
    getCalendar: getCalendarMock,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: getSessionMock,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-1', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})
const RANGE = { from: '2026-11-16', to: '2026-11-22' }

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('GET_CALENDAR_PROTECTED_CONTROLLER', () => {
    beforeEach(() => {
        getCalendarMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('passes the signed-in user and the range to the service and returns its result', async () => {
        getCalendarMock.mockReturnValue(Effect.succeed([]))

        await expect(caller.training.getCalendar(RANGE)).resolves.toEqual([])
        expect(getCalendarMock).toHaveBeenCalledWith(USER, RANGE)
    })

    it('requires a signed-in user', async () => {
        getSessionMock.mockReturnValue(Effect.succeed(null))

        const error = await caught(caller.training.getCalendar(RANGE))

        expect(error.code).toBe('UNAUTHORIZED')
        expect(getCalendarMock).not.toHaveBeenCalled()
    })

    it.each([
        { from: '16-11-2026', to: '2026-11-22' },
        { from: '2026-11-16', to: 'tomorrow' },
        { from: '2026-02-30', to: '2026-03-02' },
        { from: '2026-11-16T00:00:00Z', to: '2026-11-22' },
    ])('rejects a malformed or impossible date before reaching the service: %j', async (input) => {
        const error = await caught(caller.training.getCalendar(input))

        expect(error.code).toBe('BAD_REQUEST')
        expect(getCalendarMock).not.toHaveBeenCalled()
    })

    it('maps InvalidDateRangeError to BAD_REQUEST', async () => {
        getCalendarMock.mockReturnValue(
            Effect.fail(
                new InvalidDateRangeError({
                    cause: 'from is after to',
                    error_hash: ErrorCode.TRAINING_RANGE_INVALID,
                })
            )
        )

        const error = await caught(caller.training.getCalendar(RANGE))

        expect(error.code).toBe('BAD_REQUEST')
        expect(error.message).toBe(ErrorCode.TRAINING_RANGE_INVALID)
    })

    it('maps ActivityQueryError and CreateSbClientError to INTERNAL_SERVER_ERROR without the cause', async () => {
        getCalendarMock.mockReturnValueOnce(
            Effect.fail(
                new ActivityQueryError({
                    cause: '42501: permission denied',
                    error_hash: ErrorCode.TRAINING_ACTIVITY_RANGE_ERR,
                })
            )
        )
        const query = await caught(caller.training.getCalendar(RANGE))

        getCalendarMock.mockReturnValueOnce(
            Effect.fail(
                new CreateSbClientError({
                    cause: 'no cookies',
                    error_hash: ErrorCode.TRAINING_SB_CLIENT,
                })
            )
        )
        const client = await caught(caller.training.getCalendar(RANGE))

        expect(query.code).toBe('INTERNAL_SERVER_ERROR')
        expect(query.message).toBe(ErrorCode.TRAINING_ACTIVITY_RANGE_ERR)
        expect(query.cause).toBeUndefined()
        expect(client.code).toBe('INTERNAL_SERVER_ERROR')
        expect(client.message).toBe(ErrorCode.TRAINING_SB_CLIENT)
    })
})
