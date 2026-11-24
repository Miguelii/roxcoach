// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeAdminDb, ok as adminOk } from '@/_bff/lib/fake-admin-db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    deleteLyftaConnection,
    finishLyftaSync,
    setLyftaSyncRunId,
    takeLyftaSyncLease,
    selectLyftaConnection,
    updateLyftaLastSyncedAt,
    upsertLyftaConnection,
} from '@/_bff/modules/lyfta/repositories/lyfta-connections.repository'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'

const USER_ID = 'user-lyfta-1'
const ENCRYPTED_KEY = 'v1.encrypted.fixture'
const STARTED_AT = '2026-11-20T08:30:00.000Z'
const STALE_BEFORE = '2026-11-20T08:10:00.000Z'
const FINISHED_AT = '2026-11-20T08:34:00.000Z'
const SYNC_COLUMNS = {
    sync_status: 'succeeded',
    sync_started_at: STARTED_AT,
    sync_finished_at: FINISHED_AT,
    sync_result: { created: 2, updated: 1, hasMore: false },
    sync_error: null,
}

describe('Lyfta connection repository', () => {
    it('selects one user-scoped connection without selecting unrelated columns', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok({ encrypted_api_key: ENCRYPTED_KEY, last_synced_at: null, ...SYNC_COLUMNS }),
        ])

        const result = await Effect.runPromise(selectLyftaConnection(supabase, USER_ID))

        expect(result).toEqual({
            encryptedApiKey: ENCRYPTED_KEY,
            lastSyncedAt: null,
            sync: SYNC_COLUMNS,
        })
        expect(from).toHaveBeenCalledWith('lyfta_connections')
        expect(chains[0]?.select).toHaveBeenCalledWith(
            'encrypted_api_key, last_synced_at, sync_status, sync_started_at, sync_finished_at, sync_result, sync_error'
        )
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.maybeSingle).toHaveBeenCalledTimes(1)
    })

    it('scopes inserts, checkpoint updates and disconnect deletes by user id', async () => {
        const { chains, supabase } = makeFakeDb([ok(), ok({ user_id: USER_ID }), ok()])

        await Effect.runPromise(upsertLyftaConnection(supabase, USER_ID, ENCRYPTED_KEY))
        const updated = await Effect.runPromise(
            updateLyftaLastSyncedAt(supabase, USER_ID, STARTED_AT, '2026-11-20T08:34:00.000Z')
        )
        await Effect.runPromise(deleteLyftaConnection(supabase, USER_ID))

        expect(chains[0]?.upsert).toHaveBeenCalledWith(
            { user_id: USER_ID, encrypted_api_key: ENCRYPTED_KEY },
            { onConflict: 'user_id' }
        )
        expect(updated).toBe(true)
        expect(chains[1]?.update).toHaveBeenCalledWith({
            last_synced_at: '2026-11-20T08:34:00.000Z',
        })
        expect(chains[1]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[1]?.eq).toHaveBeenCalledWith('sync_started_at', STARTED_AT)
        expect(chains[1]?.eq).toHaveBeenCalledWith('sync_status', 'running')
        expect(chains[2]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
    })

    it('fails explicitly for malformed rows, returned errors and rejected queries', async () => {
        const malformed = makeFakeDb([ok({ encrypted_api_key: ENCRYPTED_KEY })])
        const returnedError = makeFakeDb([
            { data: null, error: { code: 'XX001', message: 'query failed' } },
        ])
        const rejected = makeFakeDb([new Error('connection failed')])

        const malformedExit = await Effect.runPromiseExit(
            selectLyftaConnection(malformed.supabase, USER_ID)
        )
        const returnedErrorExit = await Effect.runPromiseExit(
            selectLyftaConnection(returnedError.supabase, USER_ID)
        )
        const rejectedExit = await Effect.runPromiseExit(
            selectLyftaConnection(rejected.supabase, USER_ID)
        )

        expect(failureTag(malformedExit)).toBe('LyftaConnectionParseError')
        expect(failureTag(returnedErrorExit)).toBe('LyftaConnectionQueryError')
        expect(failureTag(rejectedExit)).toBe('LyftaConnectionQueryError')
    })

    it('reports a lost lease when the checkpoint update matches no running row of this run', async () => {
        const { supabase } = makeFakeDb([ok(null)])

        const updated = await Effect.runPromise(
            updateLyftaLastSyncedAt(supabase, USER_ID, STARTED_AT, '2026-11-20T08:34:00.000Z')
        )

        expect(updated).toBe(false)
    })

    it('fails the checkpoint update on a returned error or a rejected query', async () => {
        const returnedError = makeFakeDb([
            { data: null, error: { code: 'XX001', message: 'update failed' } },
        ])
        const rejected = makeFakeDb([new Error('connection failed')])

        const returnedErrorExit = await Effect.runPromiseExit(
            updateLyftaLastSyncedAt(returnedError.supabase, USER_ID, STARTED_AT, FINISHED_AT)
        )
        const rejectedExit = await Effect.runPromiseExit(
            updateLyftaLastSyncedAt(rejected.supabase, USER_ID, STARTED_AT, FINISHED_AT)
        )

        expect(failureTag(returnedErrorExit)).toBe('LyftaConnectionWriteError')
        expect(failureTag(rejectedExit)).toBe('LyftaConnectionWriteError')
    })

    it('takes the sync lease when it is not running or stale, and reports whether it won', async () => {
        const won = makeFakeAdminDb(() => adminOk({ user_id: USER_ID }))
        const lost = makeFakeAdminDb(() => adminOk(null))

        const first = await Effect.runPromise(
            takeLyftaSyncLease(won.supabase, USER_ID, STARTED_AT, STALE_BEFORE)
        )
        const second = await Effect.runPromise(
            takeLyftaSyncLease(lost.supabase, USER_ID, STARTED_AT, STALE_BEFORE)
        )

        expect(first).toBe(true)
        expect(second).toBe(false)
        expect(won.calls[0]).toMatchObject({
            table: 'lyfta_connections',
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

        await Effect.runPromise(setLyftaSyncRunId(supabase, USER_ID, STARTED_AT, 'run_123'))

        expect(calls[0]).toMatchObject({ op: 'update', payload: { sync_run_id: 'run_123' } })
        expect(calls[0]?.filters).toContainEqual(['user_id', USER_ID])
        expect(calls[0]?.filters).toContainEqual(['sync_started_at', STARTED_AT])
        expect(calls[0]?.filters).toContainEqual(['sync_status', 'running'])
    })

    it('finishes only the running lease this run holds and stores the outcome', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => adminOk())

        await Effect.runPromise(
            finishLyftaSync(
                supabase,
                USER_ID,
                STARTED_AT,
                { status: 'succeeded', result: { created: 3, updated: 1, hasMore: false } },
                FINISHED_AT
            )
        )
        await Effect.runPromise(
            finishLyftaSync(
                supabase,
                USER_ID,
                STARTED_AT,
                { status: 'failed', errorCode: ErrorCode.LYFTA_CREDENTIAL },
                FINISHED_AT
            )
        )

        expect(calls[0]).toMatchObject({
            op: 'update',
            payload: {
                sync_status: 'succeeded',
                sync_finished_at: FINISHED_AT,
                sync_result: { created: 3, updated: 1, hasMore: false },
                sync_error: null,
            },
        })
        expect(calls[1]).toMatchObject({
            op: 'update',
            payload: {
                sync_status: 'failed',
                sync_finished_at: FINISHED_AT,
                sync_result: null,
                sync_error: ErrorCode.LYFTA_CREDENTIAL,
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
        const outcome = { status: 'failed', errorCode: ErrorCode.LYFTA_SYNC_FAILED } as const

        const exits = await Promise.all(
            [returned, rejected].flatMap((db) => [
                Effect.runPromiseExit(
                    takeLyftaSyncLease(db.supabase, USER_ID, STARTED_AT, STALE_BEFORE)
                ),
                Effect.runPromiseExit(
                    setLyftaSyncRunId(db.supabase, USER_ID, STARTED_AT, 'run_123')
                ),
                Effect.runPromiseExit(
                    finishLyftaSync(db.supabase, USER_ID, STARTED_AT, outcome, FINISHED_AT)
                ),
            ])
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual(
            Array.from({ length: 6 }, () => 'LyftaConnectionWriteError')
        )
    })

    it('resets the sync state to idle when the checkpoint is reset', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => adminOk())

        await Effect.runPromise(upsertLyftaConnection(supabase, USER_ID, ENCRYPTED_KEY, true))

        expect(calls[0]?.payload).toEqual({
            user_id: USER_ID,
            encrypted_api_key: ENCRYPTED_KEY,
            last_synced_at: null,
            sync_status: 'idle',
            sync_started_at: null,
            sync_finished_at: null,
            sync_run_id: null,
            sync_result: null,
            sync_error: null,
        })
    })

    it('resets the checkpoint in the same upsert only when asked', async () => {
        const { chains, supabase } = makeFakeDb([ok(), ok()])

        await Effect.runPromise(upsertLyftaConnection(supabase, USER_ID, ENCRYPTED_KEY, true))
        await Effect.runPromise(upsertLyftaConnection(supabase, USER_ID, ENCRYPTED_KEY))

        expect(chains[0]?.upsert.mock.calls[0]?.[0]).toMatchObject({ last_synced_at: null })
        expect(chains[1]?.upsert.mock.calls[0]?.[0]).not.toHaveProperty('last_synced_at')
        expect(chains[1]?.upsert.mock.calls[0]?.[0]).not.toHaveProperty('sync_status')
    })
})
