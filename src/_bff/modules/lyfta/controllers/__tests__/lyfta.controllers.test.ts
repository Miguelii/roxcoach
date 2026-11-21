// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    LyftaCredentialError,
    LyftaRateLimitError,
    LyftaSyncInProgressError,
} from '@/_bff/lib/errors'

const mocks = vi.hoisted(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    getConnectionStatus: vi.fn(),
    syncWorkouts: vi.fn(),
    getSession: vi.fn(),
}))

vi.mock('@/_bff/modules/lyfta/services/lyfta-connection.service', () => ({
    connectLyfta: mocks.connect,
    disconnectLyfta: mocks.disconnect,
    getLyftaConnectionStatus: mocks.getConnectionStatus,
}))
vi.mock('@/_bff/modules/lyfta/services/sync-lyfta-workouts.service', () => ({
    syncLyftaWorkouts: mocks.syncWorkouts,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: mocks.getSession,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-lyfta-controller', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('Expected a TRPCError')
}

describe('Lyfta controllers', () => {
    beforeEach(() => {
        mocks.connect.mockReset()
        mocks.disconnect.mockReset()
        mocks.getConnectionStatus.mockReset()
        mocks.syncWorkouts.mockReset()
        mocks.getSession.mockReset().mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns connection status for the signed-in user', async () => {
        mocks.getConnectionStatus.mockReturnValue(
            Effect.succeed({ connected: true, lastSyncedAt: null })
        )

        await expect(caller.lyfta.getConnectionStatus()).resolves.toEqual({
            connected: true,
            lastSyncedAt: null,
        })
        expect(mocks.getConnectionStatus).toHaveBeenCalledWith(USER)
    })

    it('validates a key before passing it to the connection service', async () => {
        mocks.connect.mockReturnValue(Effect.succeed({ connected: true, lastSyncedAt: null }))

        await expect(caller.lyfta.connect({ apiKey: 'candidate-key' })).resolves.toEqual({
            connected: true,
            lastSyncedAt: null,
        })
        expect(mocks.connect).toHaveBeenCalledWith(USER, 'candidate-key')

        const error = await caught(caller.lyfta.connect({ apiKey: ' ' }))
        expect(error.code).toBe('BAD_REQUEST')
        expect(mocks.connect).toHaveBeenCalledTimes(1)
    })

    it('maps rejected credentials and rate limits to safe client errors', async () => {
        mocks.connect.mockReturnValueOnce(
            Effect.fail(
                new LyftaCredentialError({
                    cause: 'rejected',
                    error_hash: ErrorCode.LYFTA_CREDENTIAL,
                })
            )
        )
        const credential = await caught(caller.lyfta.connect({ apiKey: 'invalid-key' }))

        mocks.syncWorkouts.mockReturnValueOnce(
            Effect.fail(
                new LyftaRateLimitError({
                    cause: 'rate limited',
                    error_hash: ErrorCode.LYFTA_RATE_LIMIT,
                })
            )
        )
        const rateLimit = await caught(caller.lyfta.syncWorkouts())

        expect(credential.code).toBe('BAD_REQUEST')
        expect(credential.message).toBe(ErrorCode.LYFTA_CREDENTIAL)
        expect(rateLimit.code).toBe('TOO_MANY_REQUESTS')
        expect(rateLimit.message).toBe(ErrorCode.LYFTA_RATE_LIMIT)
    })

    it('refuses an over-long key and maps an overlapping sync to CONFLICT with a fixed message', async () => {
        const tooLong = await caught(caller.lyfta.connect({ apiKey: 'k'.repeat(513) }))
        mocks.connect.mockReturnValue(Effect.succeed({ connected: true, lastSyncedAt: null }))
        await caller.lyfta.connect({ apiKey: 'k'.repeat(512) })

        mocks.syncWorkouts.mockReturnValueOnce(
            Effect.fail(
                new LyftaSyncInProgressError({
                    cause: 'running',
                    error_hash: ErrorCode.LYFTA_SYNC_IN_PROGRESS,
                })
            )
        )
        const conflict = await caught(caller.lyfta.syncWorkouts())

        expect(tooLong.code).toBe('BAD_REQUEST')
        expect(mocks.connect).toHaveBeenCalledTimes(1)
        expect(conflict.code).toBe('CONFLICT')
        expect(conflict.message).toBe('A Lyfta sync is already running')
    })

    it('syncs and disconnects through protected procedures', async () => {
        mocks.syncWorkouts.mockReturnValue(
            Effect.succeed({ created: 2, updated: 1, lastSyncedAt: '2026-11-20T08:30:00.000Z' })
        )
        mocks.disconnect.mockReturnValue(Effect.void)

        await expect(caller.lyfta.syncWorkouts()).resolves.toMatchObject({
            created: 2,
            updated: 1,
        })
        await expect(caller.lyfta.disconnect()).resolves.toBeUndefined()
        expect(mocks.syncWorkouts).toHaveBeenCalledWith(USER)
        expect(mocks.disconnect).toHaveBeenCalledWith(USER)
    })

    it('requires an authenticated user', async () => {
        mocks.getSession.mockReturnValue(Effect.succeed(null))

        const error = await caught(caller.lyfta.getConnectionStatus())

        expect(error.code).toBe('UNAUTHORIZED')
        expect(mocks.getConnectionStatus).not.toHaveBeenCalled()
    })
})
