// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    deleteLyftaConnection,
    releaseLyftaSyncLease,
    takeLyftaSyncLease,
    selectLyftaConnection,
    updateLyftaLastSyncedAt,
    upsertLyftaConnection,
} from '@/_bff/modules/lyfta/repositories/lyfta-connections.repository'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

const USER_ID = 'user-lyfta-1'
const ENCRYPTED_KEY = 'v1.encrypted.fixture'

describe('Lyfta connection repository', () => {
    it('selects one user-scoped connection without selecting unrelated columns', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok({ encrypted_api_key: ENCRYPTED_KEY, last_synced_at: null }),
        ])

        const result = await Effect.runPromise(selectLyftaConnection(supabase, USER_ID))

        expect(result).toEqual({ encryptedApiKey: ENCRYPTED_KEY, lastSyncedAt: null })
        expect(from).toHaveBeenCalledWith('lyfta_connections')
        expect(chains[0]?.select).toHaveBeenCalledWith('encrypted_api_key, last_synced_at')
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.maybeSingle).toHaveBeenCalledTimes(1)
    })

    it('scopes inserts, checkpoint updates and disconnect deletes by user id', async () => {
        const { chains, supabase } = makeFakeDb([ok(), ok({ user_id: USER_ID }), ok()])

        await Effect.runPromise(upsertLyftaConnection(supabase, USER_ID, ENCRYPTED_KEY))
        await Effect.runPromise(
            updateLyftaLastSyncedAt(supabase, USER_ID, '2026-11-20T08:30:00.000Z')
        )
        await Effect.runPromise(deleteLyftaConnection(supabase, USER_ID))

        expect(chains[0]?.upsert).toHaveBeenCalledWith(
            { user_id: USER_ID, encrypted_api_key: ENCRYPTED_KEY },
            { onConflict: 'user_id' }
        )
        expect(chains[1]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
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

    it('fails the checkpoint update when the user has no connection row', async () => {
        const { supabase } = makeFakeDb([ok(null)])
        const exit = await Effect.runPromiseExit(
            updateLyftaLastSyncedAt(supabase, USER_ID, '2026-11-20T08:30:00.000Z')
        )

        expect(failureTag(exit)).toBe('LyftaConnectionWriteError')
    })

    it('takes the sync lease with a user-scoped compare-and-set and reports whether it won', async () => {
        const won = makeFakeDb([ok({ user_id: USER_ID })])
        const lost = makeFakeDb([ok(null)])

        const first = await Effect.runPromise(
            takeLyftaSyncLease(
                won.supabase,
                USER_ID,
                '2026-11-20T08:30:00.000Z',
                '2026-11-20T08:25:00.000Z'
            )
        )
        const second = await Effect.runPromise(
            takeLyftaSyncLease(
                lost.supabase,
                USER_ID,
                '2026-11-20T08:30:00.000Z',
                '2026-11-20T08:25:00.000Z'
            )
        )

        expect(first).toBe(true)
        expect(second).toBe(false)
        expect(won.chains[0]?.update).toHaveBeenCalledWith({
            sync_started_at: '2026-11-20T08:30:00.000Z',
        })
        expect(won.chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(won.chains[0]?.or).toHaveBeenCalledWith(
            'sync_started_at.is.null,sync_started_at.lt.2026-11-20T08:25:00.000Z'
        )
    })

    it('releases only the lease it took, scoped by user id', async () => {
        const { chains, supabase } = makeFakeDb([ok()])

        await Effect.runPromise(
            releaseLyftaSyncLease(supabase, USER_ID, '2026-11-20T08:30:00.000Z')
        )

        expect(chains[0]?.update).toHaveBeenCalledWith({ sync_started_at: null })
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenCalledWith('sync_started_at', '2026-11-20T08:30:00.000Z')
    })

    it('fails the lease calls on a returned error and on a rejected query', async () => {
        const returned = makeFakeDb([{ data: null, error: { code: 'XX001', message: 'no' } }])
        const rejected = makeFakeDb([new Error('down')])

        expect(
            failureTag(
                await Effect.runPromiseExit(
                    takeLyftaSyncLease(returned.supabase, USER_ID, 'a', 'b')
                )
            )
        ).toBe('LyftaConnectionWriteError')
        expect(
            failureTag(
                await Effect.runPromiseExit(releaseLyftaSyncLease(rejected.supabase, USER_ID, 'a'))
            )
        ).toBe('LyftaConnectionWriteError')
    })

    it('resets the checkpoint in the same upsert only when asked', async () => {
        const { chains, supabase } = makeFakeDb([ok(), ok()])

        await Effect.runPromise(upsertLyftaConnection(supabase, USER_ID, ENCRYPTED_KEY, true))
        await Effect.runPromise(upsertLyftaConnection(supabase, USER_ID, ENCRYPTED_KEY))

        expect(chains[0]?.upsert.mock.calls[0]?.[0]).toMatchObject({ last_synced_at: null })
        expect(chains[1]?.upsert.mock.calls[0]?.[0]).not.toHaveProperty('last_synced_at')
    })
})
