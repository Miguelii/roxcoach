// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ProfileQueryError, ProfileValidationError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { ProfileInput } from '@/_bff/modules/athlete/types'

const { getProfileMock, updateProfileMock, setDashboardModeMock, getSessionMock } = vi.hoisted(
    () => ({
        getProfileMock: vi.fn(),
        updateProfileMock: vi.fn(),
        setDashboardModeMock: vi.fn(),
        getSessionMock: vi.fn(),
    })
)

vi.mock('@/_bff/modules/athlete/services/get-profile.service', () => ({
    getProfile: getProfileMock,
}))
vi.mock('@/_bff/modules/athlete/services/set-dashboard-mode.service', () => ({
    setDashboardMode: setDashboardModeMock,
}))
vi.mock('@/_bff/modules/athlete/services/update-profile.service', () => ({
    updateProfile: updateProfileMock,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: getSessionMock,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-1', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})

const INPUT: ProfileInput = {
    displayName: 'Ana',
    timezone: 'Europe/Lisbon',
    maxHr: 190,
    restingHr: 50,
    hyroxDivision: 'open_women',
    weeklyHoursCap: 8,
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

describe('profile controllers', () => {
    beforeEach(() => {
        getProfileMock.mockReset()
        updateProfileMock.mockReset()
        setDashboardModeMock.mockReset()
        getSessionMock.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('getProfile returns the profile of the signed-in user', async () => {
        getProfileMock.mockReturnValue(Effect.succeed(INPUT))

        await expect(caller.athlete.getProfile()).resolves.toEqual(INPUT)
        expect(getProfileMock).toHaveBeenCalledWith(USER)
    })

    it('getProfile maps query failures to INTERNAL_SERVER_ERROR without the cause', async () => {
        getProfileMock.mockReturnValue(
            Effect.fail(
                new ProfileQueryError({
                    cause: '42501: denied',
                    error_hash: ErrorCode.ATHLETE_PROFILE_FULL_SELECT_ERR,
                })
            )
        )

        const error = await caught(caller.athlete.getProfile())

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
        expect(error.cause).toBeUndefined()
    })

    it('updateProfile saves a valid input', async () => {
        updateProfileMock.mockReturnValue(Effect.succeed(INPUT))

        await expect(caller.athlete.updateProfile(INPUT)).resolves.toEqual(INPUT)
        expect(updateProfileMock).toHaveBeenCalledWith(USER, INPUT)
    })

    it('updateProfile rejects out-of-range input with BAD_REQUEST before the service', async () => {
        const error = await caught(caller.athlete.updateProfile({ ...INPUT, maxHr: 231 }))

        expect(error.code).toBe('BAD_REQUEST')
        expect(updateProfileMock).not.toHaveBeenCalled()
    })

    it('updateProfile maps ProfileValidationError to BAD_REQUEST', async () => {
        updateProfileMock.mockReturnValue(
            Effect.fail(
                new ProfileValidationError({
                    cause: 'bad',
                    error_hash: ErrorCode.ATHLETE_PROFILE_INVALID,
                    field: 'timezone',
                })
            )
        )

        const error = await caught(caller.athlete.updateProfile(INPUT))

        expect(error.code).toBe('BAD_REQUEST')
        expect(error.cause).toBeUndefined()
    })

    it('updateProfile maps ProfileQueryError to INTERNAL_SERVER_ERROR', async () => {
        updateProfileMock.mockReturnValue(
            Effect.fail(
                new ProfileQueryError({
                    cause: 'x',
                    error_hash: ErrorCode.ATHLETE_PROFILE_UPSERT_ERR,
                })
            )
        )

        const error = await caught(caller.athlete.updateProfile(INPUT))

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
    })
    it('setDashboardMode saves a valid mode', async () => {
        setDashboardModeMock.mockReturnValue(Effect.succeed({ status: 200 }))

        await expect(caller.athlete.setDashboardMode({ mode: 'strength' })).resolves.toEqual({
            status: 200,
        })
        expect(setDashboardModeMock).toHaveBeenCalledWith(USER, 'strength')
    })

    it('setDashboardMode rejects an unknown mode with BAD_REQUEST before the service', async () => {
        // SAFETY: deliberately invalid input to prove the zod enum rejects it.
        const error = await caught(caller.athlete.setDashboardMode({ mode: 'swim' as never }))

        expect(error.code).toBe('BAD_REQUEST')
        expect(setDashboardModeMock).not.toHaveBeenCalled()
    })

    it('setDashboardMode maps ProfileQueryError to INTERNAL_SERVER_ERROR', async () => {
        setDashboardModeMock.mockReturnValue(
            Effect.fail(
                new ProfileQueryError({
                    cause: 'no profile row to update',
                    error_hash: ErrorCode.ATHLETE_DASHBOARD_MODE_UPDATE_ERR,
                })
            )
        )

        const error = await caught(caller.athlete.setDashboardMode({ mode: 'run' }))

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
        expect(error.cause).toBeUndefined()
    })
})
