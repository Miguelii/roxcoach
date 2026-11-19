// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { StravaApiError, StravaRateLimitedError, StravaUnauthorizedError } from '@/_bff/lib/errors'
import { backfillStravaJob } from '@/_bff/modules/strava/jobs/backfill-strava.job'
import { syncMissingStravaJob } from '@/_bff/modules/strava/jobs/sync-missing-strava.job'

type CatchErrorResult = { skipRetrying?: boolean; retryAt?: Date } | undefined

// The `task` mock returns its options, so a job is its own options object.
type JobOptions = {
    id: string
    maxDuration?: number
    retry?: { maxAttempts?: number }
    run: (payload: { userId: string }) => Promise<object>
    catchError?: (params: { error: unknown; retryDelayInMs?: number }) => CatchErrorResult
}

const { syncMissingActivitiesMock, resolveSyncMissingWindowMock } = vi.hoisted(() => ({
    syncMissingActivitiesMock: vi.fn(),
    resolveSyncMissingWindowMock: vi.fn(),
}))

vi.mock('@trigger.dev/sdk', () => ({
    task: <Options>(options: Options) => options,
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/_bff/modules/strava/services/sync-missing-activities.service', () => ({
    syncMissingActivities: syncMissingActivitiesMock,
}))
vi.mock('@/_bff/modules/strava/services/resolve-sync-missing-window.service', () => ({
    resolveSyncMissingWindow: resolveSyncMissingWindowMock,
}))

// SAFETY: the mocked `task` returns the options object it receives, so the job is that object.
const asJob = (job: { id: string }) => job as JobOptions

const backfillJob = asJob(backfillStravaJob)
const syncMissingJob = asJob(syncMissingStravaJob)

const USER_ID = 'user-1'
const DAY_S = 24 * 60 * 60

const unauthorized = () =>
    new StravaUnauthorizedError({
        cause: 'HTTP 401',
        error_hash: ErrorCode.STRAVA_API_UNAUTHORIZED,
        status: 401,
    })
const rateLimited = (retryAfterS: number | null) =>
    new StravaRateLimitedError({
        cause: 'HTTP 429',
        error_hash: ErrorCode.STRAVA_API_RATE_LIMITED,
        retryAfterS,
    })
const serverError = () =>
    new StravaApiError({ cause: 'HTTP 503', error_hash: ErrorCode.STRAVA_API_HTTP, status: 503 })

afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe('backfill-strava', () => {
    it('syncs the last 35 days first, then the last 12 months', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
        syncMissingActivitiesMock.mockReturnValue(Effect.succeed({ synced: 3 }))

        await backfillJob.run({ userId: USER_ID })

        const now = Math.floor(new Date('2026-06-01T00:00:00Z').getTime() / 1000)
        expect(backfillJob.id).toBe('backfill-strava')
        // The recent pass does not stamp last_synced_at: only a finished full pass does.
        expect(syncMissingActivitiesMock.mock.calls).toEqual([
            [USER_ID, { afterEpochS: now - 35 * DAY_S, markSynced: false }],
            [USER_ID, { afterEpochS: now - 365 * DAY_S }],
        ])
    })

    it('does not start the 12 month pass when the recent pass fails', async () => {
        syncMissingActivitiesMock.mockReturnValue(Effect.fail(rateLimited(null)))

        await expect(backfillJob.run({ userId: USER_ID })).rejects.toMatchObject({
            tag: 'StravaRateLimitedError',
        })

        expect(syncMissingActivitiesMock).toHaveBeenCalledTimes(1)
    })

    it('allows 20 attempts so a large history converges across 15 minute rate limit waits', () => {
        expect(backfillJob.retry?.maxAttempts).toBe(20)
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

        expect(backfillJob.catchError?.({ error: thrown, retryDelayInMs: 1000 })).toEqual({
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

    it('allows 20 attempts', () => {
        expect(syncMissingJob.retry?.maxAttempts).toBe(20)
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
