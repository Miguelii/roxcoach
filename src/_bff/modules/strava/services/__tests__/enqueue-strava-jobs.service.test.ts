// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import {
    enqueueBackfill,
    enqueueSyncActivity,
    enqueueSyncMissing,
    enqueueVerifyDeauthorization,
} from '@/_bff/modules/strava/services/enqueue-strava-jobs.service'

type MockEnv = { TRIGGER_SECRET_KEY?: string }

// SAFETY: the empty env is filled in `beforeEach`, before any code reads it.
const { triggerMock, env } = vi.hoisted(() => ({ triggerMock: vi.fn(), env: {} as MockEnv }))

vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: triggerMock } }))
vi.mock('@/env/server', () => ({ ServerEnv: env }))

const USER_ID = 'user-1'
const SECRET = 'tr_dev_super_secret_key'

beforeEach(() => {
    env.TRIGGER_SECRET_KEY = SECRET
    triggerMock.mockResolvedValue({ id: 'run_1' })
})

afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe('enqueueSyncActivity', () => {
    it('triggers the job with the ids and a debounce key with a 60 second TTL', async () => {
        const payload = { userId: USER_ID, stravaActivityId: 42, eventId: 'event-1' }

        const exit = await Effect.runPromiseExit(enqueueSyncActivity(payload))

        expect(successValue(exit)).toBeUndefined()
        expect(triggerMock).toHaveBeenCalledExactlyOnceWith('sync-strava-activity', payload, {
            idempotencyKey: `${USER_ID}:42`,
            idempotencyKeyTTL: '60s',
        })
    })

    it('does not call the SDK without a trigger secret', async () => {
        env.TRIGGER_SECRET_KEY = undefined

        const exit = await Effect.runPromiseExit(
            enqueueSyncActivity({ userId: USER_ID, stravaActivityId: 42, eventId: null })
        )

        expect(failureTag(exit)).toBe('EnqueueStravaJobError')
        expect(triggerMock).not.toHaveBeenCalled()
    })

    it('maps an SDK rejection to EnqueueStravaJobError without the secret in the cause', async () => {
        triggerMock.mockRejectedValue(new Error(`401 Unauthorized for key ${SECRET}`))

        const exit = await Effect.runPromiseExit(
            enqueueSyncActivity({ userId: USER_ID, stravaActivityId: 42, eventId: null })
        )

        expect(failureTag(exit)).toBe('EnqueueStravaJobError')
        expect(JSON.stringify(exit)).not.toContain(SECRET)
    })

    it('never throws when the SDK throws synchronously', async () => {
        triggerMock.mockImplementation(() => {
            throw new Error(`boom ${SECRET}`)
        })

        const exit = await Effect.runPromiseExit(
            enqueueSyncActivity({ userId: USER_ID, stravaActivityId: 42, eventId: null })
        )

        expect(failureTag(exit)).toBe('EnqueueStravaJobError')
        expect(JSON.stringify(exit)).not.toContain(SECRET)
    })
})

describe('enqueueVerifyDeauthorization', () => {
    it('triggers the job with a per-user debounce key', async () => {
        const payload = { userId: USER_ID, eventId: 'event-2' }

        const exit = await Effect.runPromiseExit(enqueueVerifyDeauthorization(payload))

        expect(successValue(exit)).toBeUndefined()
        expect(triggerMock).toHaveBeenCalledExactlyOnceWith(
            'verify-strava-deauthorization',
            payload,
            { idempotencyKey: `${USER_ID}:verify`, idempotencyKeyTTL: '5m' }
        )
    })

    it('does not call the SDK without a trigger secret', async () => {
        env.TRIGGER_SECRET_KEY = undefined

        const exit = await Effect.runPromiseExit(
            enqueueVerifyDeauthorization({ userId: USER_ID, eventId: null })
        )

        expect(failureTag(exit)).toBe('EnqueueStravaJobError')
        expect(triggerMock).not.toHaveBeenCalled()
    })
})

describe('enqueueBackfill', () => {
    it('triggers the job with only the user id and a per-user key', async () => {
        const exit = await Effect.runPromiseExit(enqueueBackfill(USER_ID))

        expect(successValue(exit)).toBeUndefined()
        expect(triggerMock).toHaveBeenCalledExactlyOnceWith(
            'backfill-strava',
            { userId: USER_ID },
            { idempotencyKey: `${USER_ID}:backfill`, idempotencyKeyTTL: '1h' }
        )
    })

    it('does not call the SDK without a trigger secret', async () => {
        env.TRIGGER_SECRET_KEY = undefined

        const exit = await Effect.runPromiseExit(enqueueBackfill(USER_ID))

        expect(failureTag(exit)).toBe('EnqueueStravaJobError')
        expect(triggerMock).not.toHaveBeenCalled()
    })
})

describe('enqueueSyncMissing', () => {
    it('triggers the job with a per-minute key', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-01-01T00:10:30Z'))

        const exit = await Effect.runPromiseExit(enqueueSyncMissing(USER_ID))

        const minute = Math.floor(new Date('2026-01-01T00:10:30Z').getTime() / 60_000)
        expect(successValue(exit)).toBeUndefined()
        expect(triggerMock).toHaveBeenCalledExactlyOnceWith(
            'sync-missing-strava',
            { userId: USER_ID },
            { idempotencyKey: `${USER_ID}:sync-missing:${minute}`, idempotencyKeyTTL: '2m' }
        )
    })

    it('maps an SDK rejection to EnqueueStravaJobError', async () => {
        triggerMock.mockRejectedValue(new Error('network down'))

        const exit = await Effect.runPromiseExit(enqueueSyncMissing(USER_ID))

        expect(failureTag(exit)).toBe('EnqueueStravaJobError')
    })
})
