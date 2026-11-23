// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeAdminDb, ok as adminOk } from '@/_bff/lib/fake-admin-db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    deleteZeppConnection,
    finishZeppSync,
    setZeppSyncRunId,
    takeZeppSyncLease,
    selectZeppConnection,
    updateZeppLastSyncedAt,
    upsertZeppConnection,
} from '@/_bff/modules/zepp/repositories/zepp-connections.repository'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

const USER_ID = 'user-zepp-1'
const ENCRYPTED = 'v1.encrypted.fixture'
const STARTED_AT = '2026-11-20T08:30:00.000Z'
const STALE_BEFORE = '2026-11-20T08:10:00.000Z'
const FINISHED_AT = '2026-11-20T08:34:00.000Z'
const SYNC_COLUMNS = {
    sync_status: 'succeeded',
    sync_started_at: STARTED_AT,
    sync_finished_at: FINISHED_AT,
    sync_result: { imported: 2, skipped: 0, updated: 1, remaining: 0 },
    sync_error: null,
}

describe('Zepp connection repository', () => {
    it('selects one user-scoped connection', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok({ encrypted_app_token: ENCRYPTED, last_synced_at: null, ...SYNC_COLUMNS }),
        ])

        const result = await Effect.runPromise(selectZeppConnection(supabase, USER_ID))

        expect(result).toEqual({
            encryptedAppToken: ENCRYPTED,
            lastSyncedAt: null,
            sync: SYNC_COLUMNS,
        })
        expect(from).toHaveBeenCalledWith('zepp_connections')
        expect(chains[0]?.select).toHaveBeenCalledWith(
            'encrypted_app_token, last_synced_at, sync_status, sync_started_at, sync_finished_at, sync_result, sync_error'
        )
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
    })

    it('returns null when the user has no connection', async () => {
        const { supabase } = makeFakeDb([ok(null)])

        expect(await Effect.runPromise(selectZeppConnection(supabase, USER_ID))).toBeNull()
    })

    it('scopes the upsert, the checkpoint update and the delete by user id and resets the checkpoint on connect', async () => {
        const { chains, supabase } = makeFakeDb([ok(), ok({ user_id: USER_ID }), ok()])

        await Effect.runPromise(upsertZeppConnection(supabase, USER_ID, ENCRYPTED))
        await Effect.runPromise(
            updateZeppLastSyncedAt(supabase, USER_ID, '2026-11-21T10:00:00.000Z')
        )
        await Effect.runPromise(deleteZeppConnection(supabase, USER_ID))

        expect(chains[0]?.upsert).toHaveBeenCalledWith(
            {
                user_id: USER_ID,
                encrypted_app_token: ENCRYPTED,
                last_synced_at: null,
                sync_status: 'idle',
                sync_started_at: null,
                sync_finished_at: null,
                sync_run_id: null,
                sync_result: null,
                sync_error: null,
            },
            { onConflict: 'user_id' }
        )
        expect(chains[1]?.update).toHaveBeenCalledWith({
            last_synced_at: '2026-11-21T10:00:00.000Z',
        })
        expect(chains[1]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[2]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
    })

    it('fails explicitly for malformed rows, returned errors and rejected queries', async () => {
        const malformed = makeFakeDb([ok({ encrypted_app_token: ENCRYPTED, last_synced_at: null })])
        const returned = makeFakeDb([{ data: null, error: { code: 'XX001', message: 'failed' } }])
        const rejected = makeFakeDb([new Error('connection failed')])

        expect(
            failureTag(
                await Effect.runPromiseExit(selectZeppConnection(malformed.supabase, USER_ID))
            )
        ).toBe('ZeppConnectionParseError')
        expect(
            failureTag(
                await Effect.runPromiseExit(selectZeppConnection(returned.supabase, USER_ID))
            )
        ).toBe('ZeppConnectionQueryError')
        expect(
            failureTag(
                await Effect.runPromiseExit(selectZeppConnection(rejected.supabase, USER_ID))
            )
        ).toBe('ZeppConnectionQueryError')
    })

    it('fails the checkpoint update when there is no connection to update', async () => {
        const { supabase } = makeFakeDb([ok(null)])

        const exit = await Effect.runPromiseExit(
            updateZeppLastSyncedAt(supabase, USER_ID, '2026-11-21T10:00:00.000Z')
        )

        expect(failureTag(exit)).toBe('ZeppConnectionWriteError')
    })

    it('takes the sync lease when it is not running or stale, and reports whether it won', async () => {
        const won = makeFakeAdminDb(() => adminOk({ user_id: USER_ID }))
        const lost = makeFakeAdminDb(() => adminOk(null))

        const first = await Effect.runPromise(
            takeZeppSyncLease(won.supabase, USER_ID, STARTED_AT, STALE_BEFORE)
        )
        const second = await Effect.runPromise(
            takeZeppSyncLease(lost.supabase, USER_ID, STARTED_AT, STALE_BEFORE)
        )

        expect(first).toBe(true)
        expect(second).toBe(false)
        expect(won.calls[0]).toMatchObject({
            table: 'zepp_connections',
            op: 'update',
            payload: {
                sync_status: 'running',
                sync_started_at: STARTED_AT,
                sync_finished_at: null,
                sync_run_id: null,
                sync_result: null,
                sync_error: null,
            },
        })
        expect(won.calls[0]?.filters).toContainEqual(['user_id', USER_ID])
        const or = String(won.calls[0]?.filters.find(([column]) => column === 'or')?.[1])
        expect(or).toContain('sync_status.neq.running')
        expect(or).toContain(`sync_started_at.lt.${STALE_BEFORE}`)
    })

    it('records the run id only on the lease this run holds', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => adminOk())

        await Effect.runPromise(setZeppSyncRunId(supabase, USER_ID, STARTED_AT, 'run_123'))

        expect(calls[0]).toMatchObject({ op: 'update', payload: { sync_run_id: 'run_123' } })
        expect(calls[0]?.filters).toContainEqual(['user_id', USER_ID])
        expect(calls[0]?.filters).toContainEqual(['sync_started_at', STARTED_AT])
        expect(calls[0]?.filters).toContainEqual(['sync_status', 'running'])
    })

    it('finishes only the running lease this run holds and stores the outcome', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => adminOk())

        await Effect.runPromise(
            finishZeppSync(
                supabase,
                USER_ID,
                STARTED_AT,
                {
                    status: 'succeeded',
                    result: { imported: 3, skipped: 1, updated: 0, remaining: 0 },
                },
                FINISHED_AT
            )
        )
        await Effect.runPromise(
            finishZeppSync(
                supabase,
                USER_ID,
                STARTED_AT,
                { status: 'failed', errorCode: ErrorCode.ZEPP_SESSION_EXPIRED },
                FINISHED_AT
            )
        )

        expect(calls[0]).toMatchObject({
            op: 'update',
            payload: {
                sync_status: 'succeeded',
                sync_finished_at: FINISHED_AT,
                sync_result: { imported: 3, skipped: 1, updated: 0, remaining: 0 },
                sync_error: null,
            },
        })
        expect(calls[1]).toMatchObject({
            op: 'update',
            payload: {
                sync_status: 'failed',
                sync_finished_at: FINISHED_AT,
                sync_result: null,
                sync_error: ErrorCode.ZEPP_SESSION_EXPIRED,
            },
        })
        for (const call of calls) {
            expect(call.filters).toContainEqual(['user_id', USER_ID])
            expect(call.filters).toContainEqual(['sync_started_at', STARTED_AT])
            expect(call.filters).toContainEqual(['sync_status', 'running'])
        }
    })

    it('fails the sync state writes on a returned error and on a rejected query', async () => {
        const returned = makeFakeAdminDb(() => ({
            data: null,
            error: { code: 'XX001', message: 'no' },
        }))
        const rejected = makeFakeAdminDb(() => new Error('down'))
        const outcome = { status: 'failed', errorCode: ErrorCode.ZEPP_SYNC_FAILED } as const

        const exits = await Promise.all(
            [returned, rejected].flatMap((db) => [
                Effect.runPromiseExit(
                    takeZeppSyncLease(db.supabase, USER_ID, STARTED_AT, STALE_BEFORE)
                ),
                Effect.runPromiseExit(setZeppSyncRunId(db.supabase, USER_ID, STARTED_AT, 'run_1')),
                Effect.runPromiseExit(
                    finishZeppSync(db.supabase, USER_ID, STARTED_AT, outcome, FINISHED_AT)
                ),
            ])
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual(
            Array.from({ length: 6 }, () => 'ZeppConnectionWriteError')
        )
    })
})
