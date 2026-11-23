// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { CreateSbClientError, ProfileQueryError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { getTimezoneMock, getSessionMock } = vi.hoisted(() => ({
    getTimezoneMock: vi.fn(),
    getSessionMock: vi.fn(),
}))

vi.mock('@/_bff/modules/athlete/services/get-athlete-timezone.service', () => ({
    getAthleteTimezone: getTimezoneMock,
    getAthleteTimezoneWithClient: vi.fn(),
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

describe('GET_TIMEZONE_PROTECTED_CONTROLLER', () => {
    beforeEach(() => {
        getTimezoneMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('returns the timezone of the signed-in user', async () => {
        getTimezoneMock.mockReturnValue(Effect.succeed('Europe/Lisbon'))

        await expect(caller.athlete.getTimezone()).resolves.toBe('Europe/Lisbon')
        expect(getTimezoneMock).toHaveBeenCalledWith(USER)
    })

    it('requires a signed-in user', async () => {
        getSessionMock.mockReturnValue(Effect.succeed(null))

        const error = await caught(caller.athlete.getTimezone())

        expect(error.code).toBe('UNAUTHORIZED')
    })

    it('maps service failures to INTERNAL_SERVER_ERROR without the cause', async () => {
        getTimezoneMock.mockReturnValueOnce(
            Effect.fail(
                new ProfileQueryError({
                    cause: '42501: denied',
                    error_hash: ErrorCode.ATHLETE_PROFILE_SELECT_ERR,
                })
            )
        )
        const profile = await caught(caller.athlete.getTimezone())

        getTimezoneMock.mockReturnValueOnce(
            Effect.fail(
                new CreateSbClientError({
                    cause: 'no cookies',
                    error_hash: ErrorCode.ATHLETE_SB_CLIENT,
                })
            )
        )
        const client = await caught(caller.athlete.getTimezone())

        expect(profile.code).toBe('INTERNAL_SERVER_ERROR')
        expect(profile.cause).toBeUndefined()
        expect(client.code).toBe('INTERNAL_SERVER_ERROR')
        expect(client.message).toBe(ErrorCode.ATHLETE_SB_CLIENT)
    })
})
