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
    clearZeppActivities,
    getZeppActivityCount,
} from '@/_bff/modules/zepp/services/clear-zepp-activities.service'

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User
const NOW = new Date('2026-11-23T12:00:00.000Z')

const connectionRow = (syncStatus: string, startedAt: string | null) => ({
    encrypted_app_token: 'encrypted',
    last_synced_at: '2026-11-20T00:00:00.000Z',
    sync_status: syncStatus,
    sync_started_at: startedAt,
    sync_finished_at: null,
    sync_result: null,
    sync_error: null,
})

type Setup = {
    connection: ReturnType<typeof connectionRow> | null
    leaseTaken?: boolean
    resetFails?: boolean
    deleteFails?: boolean
}

const setup = ({
    connection,
    leaseTaken = true,
    resetFails = false,
    deleteFails = false,
}: Setup) => {
    const order: string[] = []
    const db = makeFakeAdminDb((call: Call) => {
        if (call.op === 'select') return ok(connection)
        if (call.filters.some(([column]) => column === 'or')) {
            order.push('lease')
            return ok(leaseTaken ? { user_id: 'user-1' } : null)
        }
        if (JSON.stringify(call.payload).includes('sync_status')) {
            order.push('release')
            return ok()
        }
        order.push('reset')
        return resetFails ? { data: null, error: { code: 'XX001', message: 'boom' } } : ok()
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

describe('clearZeppActivities', () => {
    it('fails without a connection and takes no lease, resets nothing and deletes nothing', async () => {
        const { dependencies, order } = setup({ connection: null })

        const exit = await Effect.runPromiseExit(clearZeppActivities(USER, dependencies))

        expect(failureTag(exit)).toBe('ZeppConnectionNotFoundError')
        expect(order).toEqual([])
    })

    it('refuses when the sync lease is taken and neither resets nor deletes', async () => {
        const { dependencies, order } = setup({
            connection: connectionRow('running', NOW.toISOString()),
            leaseTaken: false,
        })

        const exit = await Effect.runPromiseExit(clearZeppActivities(USER, dependencies))

        expect(failureTag(exit)).toBe('ZeppSyncInProgressError')
        expect(order).toEqual(['lease'])
    })

    it('takes the lease with the same stale rule as a sync', async () => {
        const { db, dependencies } = setup({ connection: connectionRow('idle', null) })

        await Effect.runPromise(clearZeppActivities(USER, dependencies))

        const lease = db.calls.find((call) => call.filters.some(([column]) => column === 'or'))
        expect(lease?.filters).toContainEqual([
            'or',
            `sync_status.neq.running,sync_started_at.lt.${new Date(NOW.getTime() - SYNC_LEASE_STALE_MS).toISOString()}`,
        ])
    })

    it('holds the lease while it resets the checkpoint and deletes, then releases it', async () => {
        const { db, dependencies, order } = setup({ connection: connectionRow('idle', null) })

        const result = await Effect.runPromise(clearZeppActivities(USER, dependencies))

        expect(result).toEqual({ deleted: 3 })
        expect(order).toEqual(['lease', 'reset', 'delete', 'release'])
        const reset = db.calls.find(
            (call) => JSON.stringify(call.payload) === '{"last_synced_at":null}'
        )
        expect(reset?.table).toBe('zepp_connections')
        expect(reset?.filters).toEqual([['user_id', 'user-1']])
        const release = db.calls.at(-1)
        expect(release?.payload).toEqual({ sync_status: 'idle', sync_started_at: null })
        expect(release?.filters).toEqual([
            ['user_id', 'user-1'],
            ['sync_started_at', NOW.toISOString()],
            ['sync_status', 'running'],
        ])
    })

    it('releases the lease and leaves the checkpoint already reset when the delete fails', async () => {
        const { dependencies, order } = setup({
            connection: connectionRow('idle', null),
            deleteFails: true,
        })

        const exit = await Effect.runPromiseExit(clearZeppActivities(USER, dependencies))

        expect(failureTag(exit)).toBe('ActivityWriteError')
        expect(order).toEqual(['lease', 'reset', 'delete', 'release'])
    })

    it('releases the lease and deletes nothing when the reset fails', async () => {
        const { dependencies, order } = setup({
            connection: connectionRow('idle', null),
            resetFails: true,
        })

        const exit = await Effect.runPromiseExit(clearZeppActivities(USER, dependencies))

        expect(failureTag(exit)).toBe('ZeppConnectionWriteError')
        expect(order).toEqual(['lease', 'reset', 'release'])
    })
})

describe('getZeppActivityCount', () => {
    it('returns the count of imported Zepp activities', async () => {
        const { dependencies } = setup({ connection: null })

        const result = await Effect.runPromise(getZeppActivityCount(USER, dependencies))

        expect(result).toEqual({ count: 142 })
    })
})
