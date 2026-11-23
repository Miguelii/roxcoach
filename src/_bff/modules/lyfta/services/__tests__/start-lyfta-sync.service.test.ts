// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import { SYNC_LEASE_STALE_MS } from '@/_bff/core/constants/sync.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { makeFakeAdminDb, ok, type Call } from '@/_bff/lib/fake-admin-db'
import { failureTag } from '@/_bff/lib/tests-utils'
import { LYFTA_SYNC_TASK_ID } from '@/_bff/modules/lyfta/constants'
import { startLyftaSync } from '@/_bff/modules/lyfta/services/start-lyfta-sync.service'

const USER_ID = '6f1c2c1e-6a35-4f1b-9d0e-6a7a3c0f4b21'
const NOW = new Date('2026-11-23T10:00:00.000Z')
const STARTED_AT = NOW.toISOString()
const CONNECTION_ROW = {
    encrypted_api_key: 'encrypted',
    last_synced_at: null,
    sync_status: 'idle',
    sync_started_at: null,
    sync_finished_at: null,
    sync_result: null,
    sync_error: null,
}

const setup = (options: { connection: boolean; leaseTaken: boolean; trigger?: 'ok' | 'fail' }) => {
    const db = makeFakeAdminDb((call: Call) => {
        if (call.op === 'select') return ok(options.connection ? CONNECTION_ROW : null)
        const isLease = call.filters.some(([column]) => column === 'or')
        if (isLease) return ok(options.leaseTaken ? { user_id: USER_ID } : null)
        return ok()
    })
    const triggerTask = vi.fn(async () => {
        if (options.trigger === 'fail') throw new Error('trigger down secret-token')
        return { id: 'run_1' }
    })
    return {
        db,
        triggerTask,
        dependencies: {
            createAdminClient: () => db.supabase,
            triggerTask,
            now: () => NOW,
        },
    }
}

describe('startLyftaSync', () => {
    it('fails without a connection and never triggers', async () => {
        const { dependencies, triggerTask } = setup({ connection: false, leaseTaken: true })

        const exit = await Effect.runPromiseExit(startLyftaSync(USER_ID, dependencies))

        expect(failureTag(exit)).toBe('LyftaConnectionNotFoundError')
        expect(triggerTask).not.toHaveBeenCalled()
    })

    it('fails with LyftaSyncInProgressError when the lease is not taken', async () => {
        const { dependencies, triggerTask } = setup({ connection: true, leaseTaken: false })

        const exit = await Effect.runPromiseExit(startLyftaSync(USER_ID, dependencies))

        expect(failureTag(exit)).toBe('LyftaSyncInProgressError')
        expect(triggerTask).not.toHaveBeenCalled()
    })

    it('triggers once with the idempotency key, then stores the run id', async () => {
        const { db, dependencies, triggerTask } = setup({ connection: true, leaseTaken: true })

        const result = await Effect.runPromise(startLyftaSync(USER_ID, dependencies))

        expect(result).toEqual({ startedAt: STARTED_AT })
        expect(triggerTask).toHaveBeenCalledTimes(1)
        expect(triggerTask).toHaveBeenCalledWith(
            LYFTA_SYNC_TASK_ID,
            { userId: USER_ID, startedAt: STARTED_AT },
            `lyfta:${USER_ID}:${STARTED_AT}`
        )
        const lease = db.calls.find((call) => call.filters.some(([column]) => column === 'or'))
        expect(lease?.filters).toContainEqual([
            'or',
            `sync_status.neq.running,sync_started_at.lt.${new Date(NOW.getTime() - SYNC_LEASE_STALE_MS).toISOString()}`,
        ])
        expect(db.calls.at(-1)?.payload).toEqual({ sync_run_id: 'run_1' })
    })

    it('marks the sync failed and fails with LyftaSyncEnqueueError when triggering fails', async () => {
        const { db, dependencies } = setup({ connection: true, leaseTaken: true, trigger: 'fail' })

        const exit = await Effect.runPromiseExit(startLyftaSync(USER_ID, dependencies))

        expect(failureTag(exit)).toBe('LyftaSyncEnqueueError')
        expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).not.toContain('secret-token')
        expect(db.calls.at(-1)?.payload).toMatchObject({
            sync_status: 'failed',
            sync_error: ErrorCode.LYFTA_SYNC_ENQUEUE,
        })
    })
})
