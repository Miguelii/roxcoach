// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityWriteError } from '@/_bff/lib/errors'
import { SYNC_LEASE_STALE_MS } from '@/_bff/core/constants/sync.constants'
import { makeFakeAdminDb, ok, type Call } from '@/_bff/lib/fake-admin-db'
import { asClient, failureTag } from '@/_bff/lib/tests-utils'
import {
    clearLyftaActivities,
    getLyftaActivityCount,
} from '@/_bff/modules/lyfta/services/clear-lyfta-activities.service'

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User
const NOW = new Date('2026-11-23T12:00:00.000Z')

const connectionRow = (syncStatus: string, startedAt: string | null) => ({
    encrypted_api_key: 'encrypted',
    last_synced_at: '2026-11-20T00:00:00.000Z',
    sync_status: syncStatus,
    sync_started_at: startedAt,
    sync_finished_at: null,
    sync_result: null,
    sync_error: null,
})

type Setup = {
    connection: ReturnType<typeof connectionRow> | null
    resetFails?: boolean
    deleteFails?: boolean
}

const setup = ({ connection, resetFails = false, deleteFails = false }: Setup) => {
    const order: string[] = []
    const db = makeFakeAdminDb((call: Call) => {
        if (call.op === 'select') return ok(connection)
        order.push('reset')
        return resetFails
            ? { data: null, error: { code: 'XX001', message: 'boom' } }
            : ok({ user_id: 'user-1' })
    })
    const clearActivities = () => {
        order.push('delete')
        return deleteFails
            ? Effect.fail(
                  new ActivityWriteError({
                      cause: 'x',
                      error_hash: ErrorCode.TRAINING_SOURCE_ACTIVITIES_DELETE,
                  })
              )
            : Effect.succeed(3)
    }
    return {
        db,
        order,
        dependencies: {
            createAdminClient: () => asClient(db.supabase),
            clearActivities,
            countActivities: () => Effect.succeed(142),
            now: () => NOW,
        },
    }
}

describe('clearLyftaActivities', () => {
    it('fails without a connection and neither resets nor deletes', async () => {
        const { dependencies, order } = setup({ connection: null })

        const exit = await Effect.runPromiseExit(clearLyftaActivities(USER, dependencies))

        expect(failureTag(exit)).toBe('LyftaConnectionNotFoundError')
        expect(order).toEqual([])
    })

    it('refuses while a sync runs and neither resets nor deletes', async () => {
        const startedAt = new Date(NOW.getTime() - 60_000).toISOString()
        const { dependencies, order } = setup({ connection: connectionRow('running', startedAt) })

        const exit = await Effect.runPromiseExit(clearLyftaActivities(USER, dependencies))

        expect(failureTag(exit)).toBe('LyftaSyncInProgressError')
        expect(order).toEqual([])
    })

    it('does not treat a stale running lease as a running sync', async () => {
        const startedAt = new Date(NOW.getTime() - SYNC_LEASE_STALE_MS - 1000).toISOString()
        const { dependencies } = setup({ connection: connectionRow('running', startedAt) })

        const result = await Effect.runPromise(clearLyftaActivities(USER, dependencies))

        expect(result).toEqual({ deleted: 3 })
    })

    it('resets the checkpoint first, then deletes, and returns how many were deleted', async () => {
        const { db, dependencies, order } = setup({ connection: connectionRow('idle', null) })

        const result = await Effect.runPromise(clearLyftaActivities(USER, dependencies))

        expect(result).toEqual({ deleted: 3 })
        expect(order).toEqual(['reset', 'delete'])
        const reset = db.calls.find((call) => call.op === 'update')
        expect(reset?.table).toBe('lyfta_connections')
        expect(reset?.payload).toEqual({ last_synced_at: null })
        expect(reset?.filters).toEqual([['user_id', 'user-1']])
    })

    it('leaves the checkpoint already reset when the delete fails', async () => {
        const { dependencies, order } = setup({
            connection: connectionRow('idle', null),
            deleteFails: true,
        })

        const exit = await Effect.runPromiseExit(clearLyftaActivities(USER, dependencies))

        expect(failureTag(exit)).toBe('ActivityWriteError')
        expect(order).toEqual(['reset', 'delete'])
    })

    it('deletes nothing when the reset fails', async () => {
        const { dependencies, order } = setup({
            connection: connectionRow('idle', null),
            resetFails: true,
        })

        const exit = await Effect.runPromiseExit(clearLyftaActivities(USER, dependencies))

        expect(failureTag(exit)).toBe('LyftaConnectionWriteError')
        expect(order).toEqual(['reset'])
    })
})

describe('getLyftaActivityCount', () => {
    it('returns the count of imported Lyfta activities', async () => {
        const { dependencies } = setup({ connection: null })

        const result = await Effect.runPromise(getLyftaActivityCount(USER, dependencies))

        expect(result).toEqual({ count: 142 })
    })
})
