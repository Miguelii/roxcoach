// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    ZeppConnectionNotFoundError,
    ZeppLoginRejectedError,
    ZeppSessionExpiredError,
    ZeppSyncInProgressError,
} from '@/_bff/lib/errors'

const mocks = vi.hoisted(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    getConnectionStatus: vi.fn(),
    syncActivities: vi.fn(),
    getSession: vi.fn(),
}))

vi.mock('@/_bff/modules/zepp/services/zepp-connection.service', () => ({
    connectZepp: mocks.connect,
    disconnectZepp: mocks.disconnect,
    getZeppConnectionStatus: mocks.getConnectionStatus,
}))
vi.mock('@/_bff/modules/zepp/services/start-zepp-sync.service', () => ({
    startZeppSync: mocks.syncActivities,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: mocks.getSession,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-zepp-controller', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('Expected a TRPCError')
}

describe('Zepp controllers', () => {
    beforeEach(() => {
        mocks.connect.mockReset()
        mocks.disconnect.mockReset()
        mocks.getConnectionStatus.mockReset()
        mocks.syncActivities.mockReset()
        mocks.getSession.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns the connection status for the signed-in user', async () => {
        mocks.getConnectionStatus.mockReturnValue(
            Effect.succeed({ connected: true, lastSyncedAt: null })
        )

        await expect(caller.zepp.getConnectionStatus()).resolves.toEqual({
            connected: true,
            lastSyncedAt: null,
        })
        expect(mocks.getConnectionStatus).toHaveBeenCalledWith(USER)
    })

    it('validates the email and password before logging in', async () => {
        mocks.connect.mockReturnValue(Effect.succeed({ connected: true, lastSyncedAt: null }))

        await caller.zepp.connect({ email: 'athlete@example.com', password: 'secret' })
        expect(mocks.connect).toHaveBeenCalledWith(USER, {
            email: 'athlete@example.com',
            password: 'secret',
        })

        const badEmail = await caught(caller.zepp.connect({ email: 'nope', password: 'secret' }))
        const noPassword = await caught(
            caller.zepp.connect({ email: 'athlete@example.com', password: '' })
        )
        expect(badEmail.code).toBe('BAD_REQUEST')
        expect(noPassword.code).toBe('BAD_REQUEST')
        expect(mocks.connect).toHaveBeenCalledTimes(1)
    })

    it('maps a rejected login, an expired session and a missing connection to safe client errors', async () => {
        mocks.connect.mockReturnValueOnce(
            Effect.fail(
                new ZeppLoginRejectedError({
                    cause: 'rejected',
                    error_hash: ErrorCode.ZEPP_LOGIN_REJECTED,
                })
            )
        )
        const rejected = await caught(
            caller.zepp.connect({ email: 'athlete@example.com', password: 'wrong' })
        )

        mocks.syncActivities.mockReturnValueOnce(
            Effect.fail(
                new ZeppSessionExpiredError({
                    cause: 'expired',
                    error_hash: ErrorCode.ZEPP_SESSION_EXPIRED,
                })
            )
        )
        const expired = await caught(caller.zepp.syncActivities())

        mocks.syncActivities.mockReturnValueOnce(
            Effect.fail(
                new ZeppConnectionNotFoundError({
                    cause: 'none',
                    error_hash: ErrorCode.ZEPP_NO_CONNECTION,
                })
            )
        )
        const missing = await caught(caller.zepp.syncActivities())

        expect(rejected.code).toBe('BAD_REQUEST')
        expect(rejected.message).toBe(ErrorCode.ZEPP_LOGIN_REJECTED)
        expect(expired.code).toBe('PRECONDITION_FAILED')
        expect(expired.message).toBe(ErrorCode.ZEPP_SESSION_EXPIRED)
        expect(missing.code).toBe('PRECONDITION_FAILED')
        expect(missing.message).toBe(ErrorCode.ZEPP_NO_CONNECTION)
    })

    it('maps an overlapping sync to CONFLICT with a fixed message', async () => {
        mocks.syncActivities.mockReturnValueOnce(
            Effect.fail(
                new ZeppSyncInProgressError({
                    cause: 'running',
                    error_hash: ErrorCode.ZEPP_SYNC_IN_PROGRESS,
                })
            )
        )
        const conflict = await caught(caller.zepp.syncActivities())

        expect(conflict.code).toBe('CONFLICT')
        expect(conflict.message).toBe('A Zepp sync is already running')
    })

    it('syncs and disconnects through protected procedures', async () => {
        mocks.syncActivities.mockReturnValue(
            Effect.succeed({ startedAt: '2026-11-20T08:30:00.000Z' })
        )
        mocks.disconnect.mockReturnValue(Effect.void)

        await expect(caller.zepp.syncActivities()).resolves.toEqual({
            startedAt: '2026-11-20T08:30:00.000Z',
        })
        await expect(caller.zepp.disconnect()).resolves.toBeUndefined()
        expect(mocks.syncActivities).toHaveBeenCalledWith(USER.id)
        expect(mocks.disconnect).toHaveBeenCalledWith(USER)
    })

    it('refuses every procedure without a session', async () => {
        mocks.getSession.mockReturnValue(Effect.succeed(null))

        expect((await caught(caller.zepp.getConnectionStatus())).code).toBe('UNAUTHORIZED')
        expect((await caught(caller.zepp.syncActivities())).code).toBe('UNAUTHORIZED')
    })
})
