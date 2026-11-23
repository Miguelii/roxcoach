// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { connectLyfta } from '@/_bff/modules/lyfta/services/lyfta-connection.service'
import { encryptLyftaApiKey } from '@/_bff/modules/lyfta/utils/credentials.utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

// SAFETY: These services only read the authenticated user's ID.
const USER = { id: 'user-lyfta-1' } as User
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
const API_KEY = 'test-lyfta-private-key'
const IDLE_SYNC = {
    sync_status: 'idle',
    sync_started_at: null,
    sync_finished_at: null,
    sync_result: null,
    sync_error: null,
}
const EMPTY_WORKOUT_PAGE = {
    status: true,
    total_pages: 0,
    current_page: 1,
    workouts: [],
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const response = (body: JsonValue, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })

const validFetcher = () =>
    vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ id: 123 }))
        .mockResolvedValueOnce(response(EMPTY_WORKOUT_PAGE))

const dependencies = (
    supabase: ReturnType<typeof makeFakeDb>['supabase'],
    fetcher: typeof fetch,
    encryptionKey: string | undefined = ENCRYPTION_KEY
) => ({
    createAdminClient: () => supabase,
    encryptionKey,
    fetcher,
})

describe('connectLyfta', () => {
    it('validates, encrypts and stores the key only after upstream validation', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok()])
        const fetcher = validFetcher()

        const result = await Effect.runPromise(
            connectLyfta(USER, API_KEY, dependencies(supabase, fetcher))
        )

        expect(result).toEqual({ connected: true, lastSyncedAt: null })
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER.id)
        const [row] = chains[1]?.upsert.mock.calls[0] ?? []
        expect(row).toMatchObject({ user_id: USER.id })
        expect(row?.encrypted_api_key).not.toBe(API_KEY)
        expect(row?.encrypted_api_key).toMatch(/^v1\./u)
        expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('keeps the existing credential untouched when the candidate key is rejected', async () => {
        const { from, supabase } = makeFakeDb([])
        const createAdminClient = vi.fn(() => supabase)
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, 401))
        const exit = await Effect.runPromiseExit(
            connectLyfta(USER, API_KEY, {
                createAdminClient,
                encryptionKey: ENCRYPTION_KEY,
                fetcher,
            })
        )

        expect(failureTag(exit)).toBe('LyftaCredentialError')
        expect(createAdminClient).not.toHaveBeenCalled()
        expect(from).not.toHaveBeenCalled()
    })

    it('fails before any API or database access when encryption is not configured', async () => {
        const { from, supabase } = makeFakeDb([])
        const createAdminClient = vi.fn(() => supabase)
        const fetcher = vi.fn<typeof fetch>()
        const exit = await Effect.runPromiseExit(
            connectLyfta(USER, API_KEY, {
                createAdminClient,
                encryptionKey: undefined,
                fetcher,
            })
        )

        expect(failureTag(exit)).toBe('LyftaConfigurationError')
        expect(fetcher).not.toHaveBeenCalled()
        expect(createAdminClient).not.toHaveBeenCalled()
        expect(from).not.toHaveBeenCalled()
    })

    it('preserves the sync checkpoint when the same key is saved again', async () => {
        const syncedAt = '2026-11-20T08:30:00.000Z'
        const { chains, supabase } = makeFakeDb([
            ok({
                encrypted_api_key: encryptLyftaApiKey(API_KEY, ENCRYPTION_KEY),
                last_synced_at: syncedAt,
                ...IDLE_SYNC,
            }),
            ok(),
        ])

        const result = await Effect.runPromise(
            connectLyfta(USER, API_KEY, dependencies(supabase, validFetcher()))
        )

        expect(result).toEqual({ connected: true, lastSyncedAt: syncedAt })
        expect(chains[1]?.upsert.mock.calls[0]?.[0]).not.toHaveProperty('last_synced_at')
    })

    it('resets the checkpoint when the key changes, so the next sync is a full import', async () => {
        const { chains, supabase } = makeFakeDb([
            ok({
                encrypted_api_key: encryptLyftaApiKey('another-account-key', ENCRYPTION_KEY),
                last_synced_at: '2026-11-20T08:30:00.000Z',
                ...IDLE_SYNC,
            }),
            ok(),
        ])

        const result = await Effect.runPromise(
            connectLyfta(USER, API_KEY, dependencies(supabase, validFetcher()))
        )

        expect(result).toEqual({ connected: true, lastSyncedAt: null })
        expect(chains[1]?.upsert.mock.calls[0]?.[0]).toMatchObject({
            user_id: USER.id,
            last_synced_at: null,
        })
    })

    it('treats a stored key that cannot be decrypted as a different key', async () => {
        const { chains, supabase } = makeFakeDb([
            ok({
                encrypted_api_key: 'v1.old',
                last_synced_at: '2026-11-20T08:30:00.000Z',
                ...IDLE_SYNC,
            }),
            ok(),
        ])

        const result = await Effect.runPromise(
            connectLyfta(USER, API_KEY, dependencies(supabase, validFetcher()))
        )

        expect(result.lastSyncedAt).toBeNull()
        expect(chains[1]?.upsert.mock.calls[0]?.[0]).toMatchObject({ last_synced_at: null })
    })
})
