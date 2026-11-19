// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { EnqueueStravaJobError } from '@/_bff/lib/errors'
import { syncNow } from '@/_bff/modules/strava/services/sync-now.service'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'
import { makeSyncDb, USER_ID } from '@/_bff/modules/strava/services/__tests__/sync-fixtures'

const { createDBAdminClientMock, enqueueSyncMissingMock } = vi.hoisted(() => ({
    createDBAdminClientMock: vi.fn(),
    enqueueSyncMissingMock: vi.fn(),
}))

vi.mock('@/_bff/core/db', () => ({ createDBAdminClient: createDBAdminClientMock }))
vi.mock('@/env/server', () => ({ ServerEnv: {} }))
vi.mock('@/_bff/modules/strava/services/enqueue-strava-jobs.service', () => ({
    enqueueSyncMissing: enqueueSyncMissingMock,
}))

describe('syncNow', () => {
    beforeEach(() => {
        createDBAdminClientMock.mockReset()
        enqueueSyncMissingMock.mockReset().mockReturnValue(Effect.void)
    })

    it('enqueues sync-missing for a connected user', async () => {
        const db = makeSyncDb()
        createDBAdminClientMock.mockReturnValue(db.supabase)

        const exit = await Effect.runPromiseExit(syncNow(USER_ID))

        expect(successValue(exit)).toEqual({ queued: true })
        expect(enqueueSyncMissingMock).toHaveBeenCalledTimes(1)
        expect(enqueueSyncMissingMock).toHaveBeenCalledWith(USER_ID)
        expect(db.calls[0].filters).toEqual([['user_id', USER_ID]])
    })

    it('fails with StravaNotConnectedError and enqueues nothing without a connection', async () => {
        createDBAdminClientMock.mockReturnValue(makeFakeAdminDb(() => ok(null)).supabase)

        const exit = await Effect.runPromiseExit(syncNow(USER_ID))

        expect(failureTag(exit)).toBe('StravaNotConnectedError')
        expect(enqueueSyncMissingMock).not.toHaveBeenCalled()
    })

    it('fails with EnqueueStravaJobError when the job cannot be enqueued', async () => {
        createDBAdminClientMock.mockReturnValue(makeSyncDb().supabase)
        enqueueSyncMissingMock.mockReturnValue(
            Effect.fail(
                new EnqueueStravaJobError({
                    cause: 'TRIGGER_SECRET_KEY is not set',
                    error_hash: ErrorCode.STRAVA_ENQUEUE_NOT_CONFIGURED,
                })
            )
        )

        const exit = await Effect.runPromiseExit(syncNow(USER_ID))

        expect(failureTag(exit)).toBe('EnqueueStravaJobError')
    })
})
