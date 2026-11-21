// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    deleteZeppConnection,
    selectZeppConnection,
    updateZeppLastSyncedAt,
    upsertZeppConnection,
} from '@/_bff/modules/zepp/repositories/zepp-connections.repository'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

const USER_ID = 'user-zepp-1'
const ENCRYPTED = 'v1.encrypted.fixture'

describe('Zepp connection repository', () => {
    it('selects one user-scoped connection', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok({ encrypted_app_token: ENCRYPTED, last_synced_at: null }),
        ])

        const result = await Effect.runPromise(selectZeppConnection(supabase, USER_ID))

        expect(result).toEqual({ encryptedAppToken: ENCRYPTED, lastSyncedAt: null })
        expect(from).toHaveBeenCalledWith('zepp_connections')
        expect(chains[0]?.select).toHaveBeenCalledWith('encrypted_app_token, last_synced_at')
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
            { user_id: USER_ID, encrypted_app_token: ENCRYPTED, last_synced_at: null },
            { onConflict: 'user_id' }
        )
        expect(chains[1]?.update).toHaveBeenCalledWith({
            last_synced_at: '2026-11-21T10:00:00.000Z',
        })
        expect(chains[1]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[2]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
    })

    it('fails explicitly for malformed rows, returned errors and rejected queries', async () => {
        const malformed = makeFakeDb([ok({ encrypted_app_token: ENCRYPTED })])
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
})
