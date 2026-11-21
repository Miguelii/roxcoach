// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    connectZepp,
    decryptZeppConnectionToken,
    disconnectZepp,
    getZeppConnectionStatus,
} from '@/_bff/modules/zepp/services/zepp-connection.service'
import { decryptZeppToken, encryptZeppToken } from '@/_bff/modules/zepp/utils/credentials.utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

// SAFETY: these services only read the authenticated user's ID.
const USER = { id: 'user-zepp-1' } as User
const KEY = Buffer.alloc(32, 9).toString('base64')
const INPUT = { email: 'athlete@example.com', password: 'secret-password' }

const loginFetch = () =>
    vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
            new Response(null, { status: 303, headers: { location: 'https://x.test/?access=A' } })
        )
        .mockResolvedValueOnce(
            new Response(JSON.stringify({ token_info: { app_token: 'zepp-token' } }), {
                status: 200,
            })
        )

const dependencies = (
    supabase: ReturnType<typeof makeFakeDb>['supabase'],
    fetcher: typeof fetch
) => ({
    createAdminClient: () => supabase,
    encryptionKey: KEY,
    api: { fetch: fetcher },
})

describe('connectZepp', () => {
    it('logs in and stores only the encrypted token, never the password', async () => {
        const { chains, supabase } = makeFakeDb([ok()])

        const result = await Effect.runPromise(
            connectZepp(USER, INPUT, dependencies(supabase, loginFetch()))
        )

        expect(result).toEqual({ connected: true, lastSyncedAt: null })
        const [row] = chains[0]?.upsert.mock.calls[0] ?? []
        expect(row).toMatchObject({ user_id: USER.id, last_synced_at: null })
        const stored = z.object({ encrypted_app_token: z.string() }).parse(row)
        expect(decryptZeppToken(stored.encrypted_app_token, KEY)).toBe('zepp-token')
        expect(JSON.stringify(row)).not.toContain(INPUT.password)
    })

    it('stores nothing when Zepp rejects the login', async () => {
        const { chains, supabase } = makeFakeDb([])
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }))

        const exit = await Effect.runPromiseExit(
            connectZepp(USER, INPUT, dependencies(supabase, fetcher))
        )

        expect(failureTag(exit)).toBe('ZeppLoginRejectedError')
        expect(chains).toHaveLength(0)
    })

    it('fails before any request when the encryption key is missing', async () => {
        const { supabase } = makeFakeDb([])
        const fetcher = loginFetch()

        const exit = await Effect.runPromiseExit(
            connectZepp(USER, INPUT, {
                createAdminClient: () => supabase,
                encryptionKey: undefined,
                api: { fetch: fetcher },
            })
        )

        expect(failureTag(exit)).toBe('ZeppConfigurationError')
        expect(fetcher).not.toHaveBeenCalled()
    })
})

describe('getZeppConnectionStatus', () => {
    it('is not connected without a row and reports the last sync with one', async () => {
        const none = makeFakeDb([ok(null)])
        const some = makeFakeDb([
            ok({ encrypted_app_token: 'x', last_synced_at: '2026-11-21T10:00:00.000Z' }),
        ])
        const fetcher = loginFetch()

        expect(
            await Effect.runPromise(
                getZeppConnectionStatus(USER, dependencies(none.supabase, fetcher))
            )
        ).toEqual({ connected: false, lastSyncedAt: null })
        expect(
            await Effect.runPromise(
                getZeppConnectionStatus(USER, dependencies(some.supabase, fetcher))
            )
        ).toEqual({ connected: true, lastSyncedAt: '2026-11-21T10:00:00.000Z' })
    })
})

describe('disconnectZepp', () => {
    it('deletes the row of the user', async () => {
        const { chains, supabase } = makeFakeDb([ok()])

        await Effect.runPromise(disconnectZepp(USER, dependencies(supabase, loginFetch())))

        expect(chains[0]?.delete).toHaveBeenCalled()
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER.id)
    })
})

describe('decryptZeppConnectionToken', () => {
    it('returns the token and fails with a credential error on a bad payload', async () => {
        const good = encryptZeppToken('zepp-token', KEY)

        expect(await Effect.runPromise(decryptZeppConnectionToken(good, KEY))).toBe('zepp-token')
        expect(
            failureTag(await Effect.runPromiseExit(decryptZeppConnectionToken('nope', KEY)))
        ).toBe('ZeppCredentialError')
        expect(
            failureTag(await Effect.runPromiseExit(decryptZeppConnectionToken(good, undefined)))
        ).toBe('ZeppConfigurationError')
    })
})
