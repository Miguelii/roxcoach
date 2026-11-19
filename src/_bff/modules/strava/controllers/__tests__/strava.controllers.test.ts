// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    ActivityQueryError,
    CreateSbClientError,
    EnqueueStravaJobError,
    StravaConnectionError,
    StravaNotConfiguredError,
    StravaNotConnectedError,
    StravaOAuthStateError,
} from '@/_bff/lib/errors'

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    startStravaConnect: vi.fn(),
    getStravaStatus: vi.fn(),
    disconnectStrava: vi.fn(),
    syncNow: vi.fn(),
}))

vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: mocks.getSession,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/_bff/modules/strava/services/start-strava-connect.service', () => ({
    startStravaConnect: mocks.startStravaConnect,
}))
vi.mock('@/_bff/modules/strava/services/get-strava-status.service', () => ({
    getStravaStatus: mocks.getStravaStatus,
}))
vi.mock('@/_bff/modules/strava/services/disconnect-strava.service', () => ({
    disconnectStrava: mocks.disconnectStrava,
}))
vi.mock('@/_bff/modules/strava/services/sync-now.service', () => ({
    syncNow: mocks.syncNow,
}))

const USER = { id: 'user-1', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})
const ACCESS_TOKEN = 'secret-access-token-abc'

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

const sbClient = (error_hash: ErrorCode) => new CreateSbClientError({ cause: 'no env', error_hash })
const connectionError = () =>
    new StravaConnectionError({
        cause: `42501: denied ${ACCESS_TOKEN}`,
        error_hash: ErrorCode.STRAVA_CONN_SELECT_ERR,
    })
const notConnected = () =>
    new StravaNotConnectedError({
        cause: 'no strava connection for user',
        error_hash: ErrorCode.STRAVA_SYNC_NOW_NOT_CONNECTED,
    })

describe('strava controllers', () => {
    beforeEach(() => {
        for (const mock of Object.values(mocks)) mock.mockReset()
        mocks.getSession.mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.each([
        ['getConnectUrl', () => caller.strava.getConnectUrl()],
        ['getStatus', () => caller.strava.getStatus()],
        ['disconnect', () => caller.strava.disconnect()],
        ['syncNow', () => caller.strava.syncNow()],
    ])('%s requires a signed-in user with roxcoach access', async (_name, call) => {
        mocks.getSession.mockReturnValueOnce(Effect.succeed(null))
        const anonymous = await caught(call())

        mocks.getSession.mockReturnValueOnce(Effect.succeed({ id: 'user-2', app_metadata: {} }))
        const unflagged = await caught(call())

        expect(anonymous.code).toBe('UNAUTHORIZED')
        expect(unflagged.code).toBe('FORBIDDEN')
        expect(mocks.startStravaConnect).not.toHaveBeenCalled()
        expect(mocks.getStravaStatus).not.toHaveBeenCalled()
        expect(mocks.disconnectStrava).not.toHaveBeenCalled()
        expect(mocks.syncNow).not.toHaveBeenCalled()
    })

    describe('getConnectUrl', () => {
        it('returns only the authorize url', async () => {
            mocks.startStravaConnect.mockReturnValue(
                Effect.succeed({ url: 'https://www.strava.com/oauth/authorize?state=abc' })
            )

            await expect(caller.strava.getConnectUrl()).resolves.toEqual({
                url: 'https://www.strava.com/oauth/authorize?state=abc',
            })
        })

        it('maps StravaNotConfiguredError to PRECONDITION_FAILED', async () => {
            mocks.startStravaConnect.mockReturnValue(
                Effect.fail(
                    new StravaNotConfiguredError({
                        cause: 'NEXT_STRAVA_CLIENT_ID is not set',
                        error_hash: ErrorCode.STRAVA_NOT_CONFIGURED,
                    })
                )
            )

            const error = await caught(caller.strava.getConnectUrl())

            expect(error.code).toBe('PRECONDITION_FAILED')
            expect(error.message).toBe(ErrorCode.STRAVA_NOT_CONFIGURED)
        })

        it('maps StravaOAuthStateError to INTERNAL_SERVER_ERROR', async () => {
            mocks.startStravaConnect.mockReturnValue(
                Effect.fail(
                    new StravaOAuthStateError({
                        cause: 'cookies are read-only',
                        error_hash: ErrorCode.STRAVA_CONNECT_COOKIE,
                    })
                )
            )

            const error = await caught(caller.strava.getConnectUrl())

            expect(error.code).toBe('INTERNAL_SERVER_ERROR')
            expect(error.message).toBe(ErrorCode.STRAVA_CONNECT_COOKIE)
        })
    })

    describe('getStatus', () => {
        it('passes the signed-in user id and returns the status without tokens', async () => {
            const status = {
                connected: true,
                athleteId: 12345,
                connectedAt: '2026-11-01T08:00:00+00:00',
                lastSyncedAt: null,
                activityCount: 4,
            }
            mocks.getStravaStatus.mockReturnValue(Effect.succeed(status))

            const result = await caller.strava.getStatus()

            expect(result).toEqual(status)
            for (const key of ['access_token', 'refresh_token', 'scope'])
                expect(Object.keys(result)).not.toContain(key)
            expect(mocks.getStravaStatus).toHaveBeenCalledWith(USER.id)
        })

        it.each([
            ['CreateSbClientError', () => sbClient(ErrorCode.STRAVA_STATUS_SB_CLIENT)],
            ['StravaConnectionError', connectionError],
            [
                'ActivityQueryError',
                () =>
                    new ActivityQueryError({
                        cause: 'boom',
                        error_hash: ErrorCode.TRAINING_ACTIVITY_COUNT_ERR,
                    }),
            ],
        ])('maps %s to INTERNAL_SERVER_ERROR without the cause', async (_tag, make) => {
            const failure = make()
            mocks.getStravaStatus.mockReturnValue(Effect.fail(failure))

            const error = await caught(caller.strava.getStatus())

            expect(error.code).toBe('INTERNAL_SERVER_ERROR')
            expect(error.message).toBe(failure.error_hash)
            expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN)
        })
    })

    describe('disconnect', () => {
        it('disconnects the signed-in user', async () => {
            mocks.disconnectStrava.mockReturnValue(Effect.succeed({ disconnected: true }))

            await expect(caller.strava.disconnect()).resolves.toEqual({ disconnected: true })
            expect(mocks.disconnectStrava).toHaveBeenCalledWith(USER.id)
        })

        it.each([
            ['CreateSbClientError', () => sbClient(ErrorCode.STRAVA_DISCONNECT_SB_CLIENT)],
            ['StravaConnectionError', connectionError],
        ])('maps %s to INTERNAL_SERVER_ERROR', async (_tag, make) => {
            const failure = make()
            mocks.disconnectStrava.mockReturnValue(Effect.fail(failure))

            const error = await caught(caller.strava.disconnect())

            expect(error.code).toBe('INTERNAL_SERVER_ERROR')
            expect(error.message).toBe(failure.error_hash)
        })
    })

    describe('syncNow', () => {
        it('queues a sync for the signed-in user', async () => {
            mocks.syncNow.mockReturnValue(Effect.succeed({ queued: true }))

            await expect(caller.strava.syncNow()).resolves.toEqual({ queued: true })
            expect(mocks.syncNow).toHaveBeenCalledWith(USER.id)
        })

        it('maps StravaNotConnectedError to PRECONDITION_FAILED', async () => {
            mocks.syncNow.mockReturnValue(Effect.fail(notConnected()))

            const error = await caught(caller.strava.syncNow())

            expect(error.code).toBe('PRECONDITION_FAILED')
            expect(error.message).toBe(ErrorCode.STRAVA_SYNC_NOW_NOT_CONNECTED)
        })

        it.each([
            ['CreateSbClientError', () => sbClient(ErrorCode.STRAVA_SYNC_NOW_SB_CLIENT)],
            ['StravaConnectionError', connectionError],
            [
                'EnqueueStravaJobError',
                () =>
                    new EnqueueStravaJobError({
                        cause: 'trigger down',
                        error_hash: ErrorCode.STRAVA_ENQUEUE_TRIGGER,
                    }),
            ],
        ])('maps %s to INTERNAL_SERVER_ERROR', async (_tag, make) => {
            const failure = make()
            mocks.syncNow.mockReturnValue(Effect.fail(failure))

            const error = await caught(caller.strava.syncNow())

            expect(error.code).toBe('INTERNAL_SERVER_ERROR')
            expect(error.message).toBe(failure.error_hash)
        })
    })
})
