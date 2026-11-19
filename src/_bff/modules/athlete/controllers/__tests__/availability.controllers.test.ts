// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { AvailabilityQueryError, AvailabilityValidationError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'

const { getAvailabilityMock, saveAvailabilityMock, getSessionMock } = vi.hoisted(() => ({
    getAvailabilityMock: vi.fn(),
    saveAvailabilityMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/athlete/services/get-availability.service', () => ({
    getAvailability: getAvailabilityMock,
}))
vi.mock('@/_bff/modules/athlete/services/save-availability.service', () => ({
    saveAvailability: saveAvailabilityMock,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: getSessionMock,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-1', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})

const SLOT: AvailabilitySlotDTO = {
    weekday: 1,
    sessionKind: 'run',
    isFixed: false,
    maxMinutes: 60,
    notes: null,
}

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('availability controllers', () => {
    beforeEach(() => {
        getAvailabilityMock.mockReset()
        saveAvailabilityMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('getAvailability returns the slots of the signed-in user', async () => {
        getAvailabilityMock.mockReturnValue(Effect.succeed([SLOT]))

        await expect(caller.athlete.getAvailability()).resolves.toEqual([SLOT])
        expect(getAvailabilityMock).toHaveBeenCalledWith(USER)
    })

    it('getAvailability maps query failures to INTERNAL_SERVER_ERROR without the cause', async () => {
        getAvailabilityMock.mockReturnValue(
            Effect.fail(
                new AvailabilityQueryError({
                    cause: '42501: denied',
                    error_hash: ErrorCode.ATHLETE_AVAILABILITY_SELECT_ERR,
                })
            )
        )

        const error = await caught(caller.athlete.getAvailability())

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
        expect(error.cause).toBeUndefined()
    })

    it('saveAvailability saves a valid list', async () => {
        saveAvailabilityMock.mockReturnValue(Effect.succeed([SLOT]))

        await expect(caller.athlete.saveAvailability([SLOT])).resolves.toEqual([SLOT])
        expect(saveAvailabilityMock).toHaveBeenCalledWith(USER, [SLOT])
    })

    it('saveAvailability rejects more than 28 slots with BAD_REQUEST before the service', async () => {
        const error = await caught(
            caller.athlete.saveAvailability(Array.from({ length: 29 }, () => SLOT))
        )

        expect(error.code).toBe('BAD_REQUEST')
        expect(saveAvailabilityMock).not.toHaveBeenCalled()
    })

    it('saveAvailability rejects an invalid weekday with BAD_REQUEST before the service', async () => {
        const error = await caught(caller.athlete.saveAvailability([{ ...SLOT, weekday: 8 }]))

        expect(error.code).toBe('BAD_REQUEST')
        expect(saveAvailabilityMock).not.toHaveBeenCalled()
    })

    it('saveAvailability maps AvailabilityValidationError to BAD_REQUEST', async () => {
        saveAvailabilityMock.mockReturnValue(
            Effect.fail(
                new AvailabilityValidationError({
                    cause: 'duplicate_slot',
                    error_hash: ErrorCode.ATHLETE_AVAILABILITY_INVALID,
                    reason: 'duplicate_slot',
                })
            )
        )

        const error = await caught(caller.athlete.saveAvailability([SLOT]))

        expect(error.code).toBe('BAD_REQUEST')
        expect(error.cause).toBeUndefined()
    })

    it('saveAvailability maps AvailabilityQueryError to INTERNAL_SERVER_ERROR', async () => {
        saveAvailabilityMock.mockReturnValue(
            Effect.fail(
                new AvailabilityQueryError({
                    cause: 'x',
                    error_hash: ErrorCode.ATHLETE_AVAILABILITY_DELETE_ERR,
                })
            )
        )

        const error = await caught(caller.athlete.saveAvailability([SLOT]))

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
    })
})
