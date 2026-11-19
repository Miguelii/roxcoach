// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    StravaApiError,
    StravaNotConnectedError,
    StravaPayloadError,
    StravaRateLimitedError,
    StravaUnauthorizedError,
} from '@/_bff/lib/errors'
import { backfillStravaJob } from '@/_bff/modules/strava/jobs/backfill-strava.job'
import { syncMissingStravaJob } from '@/_bff/modules/strava/jobs/sync-missing-strava.job'
import { syncStravaActivityJob } from '@/_bff/modules/strava/jobs/sync-strava-activity.job'
import { verifyStravaDeauthorizationJob } from '@/_bff/modules/strava/jobs/verify-strava-deauthorization.job'

type RetryOptions = { maxAttempts?: number; factor?: number; minTimeoutInMs?: number }

type CatchErrorResult = { skipRetrying?: boolean; retryAt?: Date } | undefined

// The `task` mock returns its options, so a job is its own options object.
type JobOptions<Payload> = {
    id: string
    maxDuration?: number
    retry?: RetryOptions
    concurrency?: { total?: number }
    run: (payload: Payload) => Promise<object>
    catchError?: (params: { error: unknown }) => CatchErrorResult
    onSuccess?: (params: { payload: Payload }) => Promise<void>
    onFailure?: (params: { payload: Payload; error: unknown }) => Promise<void>
}

type ActivityPayload = { userId: string; stravaActivityId: number; eventId: string | null }
type VerifyPayload = { userId: string; eventId: string | null }
type UserPayload = { userId: string }

const {
    syncStravaActivityMock,
    syncMissingActivitiesMock,
    verifyStravaDeauthorizationMock,
    resolveSyncMissingWindowMock,
    settleStravaEventMock,
} = vi.hoisted(() => ({
    syncStravaActivityMock: vi.fn(),
    syncMissingActivitiesMock: vi.fn(),
    verifyStravaDeauthorizationMock: vi.fn(),
    resolveSyncMissingWindowMock: vi.fn(),
    settleStravaEventMock: vi.fn(),
}))

vi.mock('@trigger.dev/sdk', () => ({
    task: <Options>(options: Options) => options,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/_bff/modules/strava/services/sync-strava-activity.service', () => ({
    syncStravaActivity: syncStravaActivityMock,
}))
vi.mock('@/_bff/modules/strava/services/sync-missing-activities.service', () => ({
    syncMissingActivities: syncMissingActivitiesMock,
}))
vi.mock('@/_bff/modules/strava/services/verify-strava-deauthorization.service', () => ({
    verifyStravaDeauthorization: verifyStravaDeauthorizationMock,
}))
vi.mock('@/_bff/modules/strava/services/resolve-sync-missing-window.service', () => ({
    resolveSyncMissingWindow: resolveSyncMissingWindowMock,
}))
vi.mock('@/_bff/modules/strava/services/settle-strava-event.service', () => ({
    settleStravaEvent: settleStravaEventMock,
}))

// SAFETY: the mocked `task` returns the options object it receives, so the job is that object.
const asJob = <Payload>(job: { id: string }) => job as JobOptions<Payload>

const syncActivityJob = asJob<ActivityPayload>(syncStravaActivityJob)
const verifyJob = asJob<VerifyPayload>(verifyStravaDeauthorizationJob)
const backfillJob = asJob<UserPayload>(backfillStravaJob)
const syncMissingJob = asJob<UserPayload>(syncMissingStravaJob)

const USER_ID = 'user-1'
const ACTIVITY_PAYLOAD: ActivityPayload = {
    userId: USER_ID,
    stravaActivityId: 42,
    eventId: 'event-1',
}
const TOKEN = 'secret-access-token-xyz'

const unauthorized = () =>
    new StravaUnauthorizedError({
        cause: `HTTP 401 ${TOKEN}`,
        error_hash: ErrorCode.STRAVA_API_UNAUTHORIZED,
        status: 401,
    })
const rateLimited = (retryAfterS: number | null) =>
    new StravaRateLimitedError({
        cause: 'HTTP 429',
        error_hash: ErrorCode.STRAVA_API_RATE_LIMITED,
        retryAfterS,
    })
const notConnected = () =>
    new StravaNotConnectedError({ cause: 'x', error_hash: ErrorCode.STRAVA_SYNC_NOT_CONNECTED })
const payloadInvalid = () =>
    new StravaPayloadError({ cause: 'x', error_hash: ErrorCode.STRAVA_SYNC_ACTIVITY_PAYLOAD })
const serverError = () =>
    new StravaApiError({ cause: 'HTTP 503', error_hash: ErrorCode.STRAVA_API_HTTP, status: 503 })

// The error the job throws, as Trigger hands it to `catchError`.
const thrownBy = async (
    job: JobOptions<ActivityPayload>,
    failure: Error
): Promise<Error | null> => {
    syncStravaActivityMock.mockReturnValue(Effect.fail(failure))
    return await job.run(ACTIVITY_PAYLOAD).then(
        () => null,
        (error: Error) => error
    )
}

afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe('sync-strava-activity', () => {
    it('runs the service with the payload ids', async () => {
        syncStravaActivityMock.mockReturnValue(Effect.succeed({ activityId: 'a1' }))

        await syncActivityJob.run(ACTIVITY_PAYLOAD)

        expect(syncActivityJob.id).toBe('sync-strava-activity')
        expect(syncStravaActivityMock).toHaveBeenCalledExactlyOnceWith(USER_ID, 42)
    })

    it('rethrows a service failure so Trigger retries it', async () => {
        const thrown = await thrownBy(syncActivityJob, serverError())

        expect(thrown).toBeInstanceOf(Error)
        expect(thrown).toMatchObject({ tag: 'StravaApiError' })
    })

    it('retries at least 3 times with exponential backoff', () => {
        expect(syncActivityJob.retry?.maxAttempts).toBeGreaterThanOrEqual(3)
        expect(syncActivityJob.retry?.factor).toBeGreaterThan(1)
    })

    it.each([
        ['unauthorized', unauthorized],
        ['not connected', notConnected],
        ['payload', payloadInvalid],
    ])('does not retry a deterministic %s failure', async (_name, make) => {
        const thrown = await thrownBy(syncActivityJob, make())

        expect(syncActivityJob.catchError?.({ error: thrown })).toEqual({ skipRetrying: true })
    })

    it.each([
        ['the Retry-After delay', 120, '2026-01-01T00:02:00Z'],
        ['at least 15 minutes when Retry-After is missing', null, '2026-01-01T00:15:00Z'],
    ])('retries a rate limit after %s', async (_name, retryAfterS, retryAt) => {
        const thrown = await thrownBy(syncActivityJob, rateLimited(retryAfterS))
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

        expect(syncActivityJob.catchError?.({ error: thrown })).toEqual({
            retryAt: new Date(retryAt),
        })
    })

    it('leaves 5xx failures to the exponential backoff', async () => {
        const thrown = await thrownBy(syncActivityJob, serverError())

        expect(syncActivityJob.catchError?.({ error: thrown })).toBeUndefined()
    })

    it('leaves an unexpected error to the exponential backoff', () => {
        expect(syncActivityJob.catchError?.({ error: new Error('socket hang up') })).toBeUndefined()
    })

    it('marks the event processed on success', async () => {
        await syncActivityJob.onSuccess?.({ payload: ACTIVITY_PAYLOAD })

        expect(settleStravaEventMock).toHaveBeenCalledExactlyOnceWith('event-1', 'processed')
    })

    it('does not touch events when the payload has no event id', async () => {
        const payload = { ...ACTIVITY_PAYLOAD, eventId: null }

        await syncActivityJob.onSuccess?.({ payload })
        await syncActivityJob.onFailure?.({ payload, error: new Error('x') })

        expect(settleStravaEventMock).not.toHaveBeenCalled()
    })

    it('marks the event failed with a safe fixed message, never the cause', async () => {
        const thrown = await thrownBy(syncActivityJob, unauthorized())

        await syncActivityJob.onFailure?.({ payload: ACTIVITY_PAYLOAD, error: thrown })

        expect(settleStravaEventMock).toHaveBeenCalledExactlyOnceWith(
            'event-1',
            'failed',
            `StravaUnauthorizedError:${ErrorCode.STRAVA_API_UNAUTHORIZED}`
        )
        expect(JSON.stringify(settleStravaEventMock.mock.calls)).not.toContain(TOKEN)
    })

    it('marks the event failed with a generic message for an unexpected error', async () => {
        await syncActivityJob.onFailure?.({
            payload: ACTIVITY_PAYLOAD,
            error: new Error(`leaked ${TOKEN}`),
        })

        expect(settleStravaEventMock).toHaveBeenCalledExactlyOnceWith(
            'event-1',
            'failed',
            'UnexpectedError'
        )
    })

    it('keeps a thrown error free of the cause object', async () => {
        const thrown = await thrownBy(syncActivityJob, unauthorized())

        expect(String(thrown)).not.toContain(TOKEN)
        expect(JSON.stringify(thrown)).not.toContain(TOKEN)
    })
})

describe('verify-strava-deauthorization', () => {
    it('runs the verification for the user', async () => {
        verifyStravaDeauthorizationMock.mockReturnValue(Effect.succeed({ disconnected: true }))

        await verifyJob.run({ userId: USER_ID, eventId: 'event-2' })

        expect(verifyJob.id).toBe('verify-strava-deauthorization')
        expect(verifyStravaDeauthorizationMock).toHaveBeenCalledExactlyOnceWith(USER_ID)
    })

    it('never runs two verifications at once', () => {
        expect(verifyJob.concurrency).toEqual({ total: 1 })
    })

    it('retries rate limits and server errors a few times', () => {
        expect(verifyJob.retry?.maxAttempts).toBeGreaterThanOrEqual(3)
    })

    it('rethrows a service failure', async () => {
        verifyStravaDeauthorizationMock.mockReturnValue(Effect.fail(serverError()))

        await expect(verifyJob.run({ userId: USER_ID, eventId: null })).rejects.toMatchObject({
            tag: 'StravaApiError',
        })
    })

    it('marks the event processed on success and failed on a final failure', async () => {
        const payload = { userId: USER_ID, eventId: 'event-2' }
        verifyStravaDeauthorizationMock.mockReturnValue(Effect.fail(rateLimited(null)))
        const thrown = await verifyJob.run(payload).then(
            () => null,
            (error: Error) => error
        )

        await verifyJob.onSuccess?.({ payload })
        await verifyJob.onFailure?.({ payload, error: thrown })

        expect(settleStravaEventMock.mock.calls).toEqual([
            ['event-2', 'processed'],
            ['event-2', 'failed', `StravaRateLimitedError:${ErrorCode.STRAVA_API_RATE_LIMITED}`],
        ])
    })

    it('applies the same retry rulings as the activity sync', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        verifyStravaDeauthorizationMock.mockReturnValue(Effect.fail(rateLimited(null)))
        const thrown = await verifyJob.run({ userId: USER_ID, eventId: null }).then(
            () => null,
            (error: Error) => error
        )

        expect(verifyJob.catchError?.({ error: thrown })).toEqual({
            retryAt: new Date('2026-01-01T00:15:00Z'),
        })
    })
})

describe('backfill-strava', () => {
    it('syncs the last 12 months', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
        syncMissingActivitiesMock.mockReturnValue(Effect.succeed({ synced: 3 }))

        await backfillJob.run({ userId: USER_ID })

        const now = Math.floor(new Date('2026-06-01T00:00:00Z').getTime() / 1000)
        expect(backfillJob.id).toBe('backfill-strava')
        expect(syncMissingActivitiesMock).toHaveBeenCalledExactlyOnceWith(USER_ID, {
            afterEpochS: now - 365 * 24 * 60 * 60,
        })
    })

    it('allows a long run and rethrows failures', async () => {
        syncMissingActivitiesMock.mockReturnValue(Effect.fail(serverError()))

        expect(backfillJob.maxDuration).toBeGreaterThanOrEqual(3600)
        await expect(backfillJob.run({ userId: USER_ID })).rejects.toMatchObject({
            tag: 'StravaApiError',
        })
    })

    it('waits out a rate limit before retrying', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
        syncMissingActivitiesMock.mockReturnValue(Effect.fail(rateLimited(null)))
        const thrown = await backfillJob.run({ userId: USER_ID }).then(
            () => null,
            (error: Error) => error
        )

        expect(backfillJob.catchError?.({ error: thrown })).toEqual({
            retryAt: new Date('2026-01-01T00:15:00Z'),
        })
    })
})

describe('sync-missing-strava', () => {
    it('syncs since the resolved last sync time', async () => {
        resolveSyncMissingWindowMock.mockReturnValue(Effect.succeed(1_700_000_000))
        syncMissingActivitiesMock.mockReturnValue(Effect.succeed({ synced: 1 }))

        await syncMissingJob.run({ userId: USER_ID })

        expect(syncMissingJob.id).toBe('sync-missing-strava')
        expect(resolveSyncMissingWindowMock).toHaveBeenCalledExactlyOnceWith(USER_ID)
        expect(syncMissingActivitiesMock).toHaveBeenCalledExactlyOnceWith(USER_ID, {
            afterEpochS: 1_700_000_000,
        })
    })

    it('rethrows a service failure', async () => {
        resolveSyncMissingWindowMock.mockReturnValue(Effect.succeed(1_700_000_000))
        syncMissingActivitiesMock.mockReturnValue(Effect.fail(unauthorized()))

        const thrown = await syncMissingJob.run({ userId: USER_ID }).then(
            () => null,
            (error: Error) => error
        )

        expect(thrown).toMatchObject({ tag: 'StravaUnauthorizedError' })
        expect(syncMissingJob.catchError?.({ error: thrown })).toEqual({ skipRetrying: true })
    })
})
