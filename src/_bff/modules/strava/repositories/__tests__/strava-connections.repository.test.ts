import { describe, expect, it, vi } from 'vitest'
import { Cause, Effect, Exit, Option } from 'effect'
import { asClient, failureTag } from '@/_bff/lib/tests-utils'
import {
    deleteConnection,
    findConnectionByStravaAthleteId,
    selectConnection,
    touchLastSyncedAt,
    updateTokensIfRefreshTokenMatches,
    upsertConnection,
} from '@/_bff/modules/strava/repositories/strava-connections.repository'

type RowData = Partial<Record<keyof typeof ROW, string | number | null>> | { user_id: string }[]
type QueryResult = {
    data: RowData | null
    error: { code: string; message: string; details: string; hint: string } | null
}

const USER_ID = 'user-1'
const ACCESS_TOKEN = 'secret-access-token-abc'
const REFRESH_TOKEN = 'secret-refresh-token-def'
const NEW_ACCESS_TOKEN = 'secret-new-access-token-ghi'
const NEW_REFRESH_TOKEN = 'secret-new-refresh-token-jkl'

const ROW = {
    user_id: USER_ID,
    strava_athlete_id: 12345,
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_at: '2026-11-19T12:00:00+00:00',
    scope: 'read,activity:read_all',
    connected_at: '2026-11-01T08:00:00+00:00',
    last_synced_at: null,
}

const NEW_TOKENS = {
    access_token: NEW_ACCESS_TOKEN,
    refresh_token: NEW_REFRESH_TOKEN,
    expires_at: '2026-11-19T18:00:00.000Z',
}

// A query chain where every builder method records its call and returns the chain. The chain is a
// promise settled on the next microtask, after the synchronous builder calls, with `result` (or
// `rejection`).
const makeChain = (result: QueryResult, rejection?: Error) => {
    const settled = new Promise<QueryResult>((resolve, reject) => {
        queueMicrotask(() => (rejection ? reject(rejection) : resolve(result)))
    })
    const chain = Object.assign(settled, {
        select: vi.fn(() => chain),
        insert: vi.fn(() => chain),
        upsert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(() => chain),
    })
    const from = vi.fn(() => chain)
    return { chain, from, supabase: asClient({ from }) }
}

const ok = (data: RowData | null = null): QueryResult => ({ data, error: null })

const SECRETS = [ACCESS_TOKEN, REFRESH_TOKEN, NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN]

// A Postgres error whose details echo the whole failing row and whose message echoes the tokens
// the query sent.
const leakyError = (sent: readonly string[]) => ({
    code: '23502',
    message: `null value in column "scope" violates not-null constraint ${sent.join(' ')}`,
    details: `Failing row contains (${USER_ID}, 12345, ${SECRETS.join(', ')}).`,
    hint: `retry with ${SECRETS.join(' ')}`,
})
const leakyThrow = (sent: readonly string[]) =>
    new Error(`socket closed while sending ${sent.join(' ')}`)

const expectNoSecrets = (exit: Exit.Exit<unknown, { cause: unknown }>) => {
    if (!Exit.isFailure(exit)) throw new Error('expected a failure')
    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isNone(failure)) throw new Error('expected a typed failure')
    const serialized = JSON.stringify(failure.value)
    const exitSerialized = JSON.stringify(exit)
    const cause = String(failure.value.cause)
    const message = failure.value instanceof Error ? failure.value.message : ''
    for (const secret of SECRETS) {
        expect(serialized).not.toContain(secret)
        expect(exitSerialized).not.toContain(secret)
        expect(cause).not.toContain(secret)
        expect(message).not.toContain(secret)
    }
}

type Client = ReturnType<typeof asClient>

// Every function with the tokens its query sends, so failure handling is checked uniformly.
const operations = [
    ['selectConnection', [], (s: Client) => selectConnection(s, USER_ID).pipe(Effect.asVoid)],
    [
        'upsertConnection',
        [ACCESS_TOKEN, REFRESH_TOKEN],
        (s: Client) =>
            upsertConnection(s, USER_ID, {
                strava_athlete_id: 12345,
                access_token: ACCESS_TOKEN,
                refresh_token: REFRESH_TOKEN,
                expires_at: ROW.expires_at,
                scope: ROW.scope,
            }).pipe(Effect.asVoid),
    ],
    ['deleteConnection', [], (s: Client) => deleteConnection(s, USER_ID)],
    [
        'updateTokensIfRefreshTokenMatches',
        [REFRESH_TOKEN, NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN],
        (s: Client) =>
            updateTokensIfRefreshTokenMatches(s, USER_ID, REFRESH_TOKEN, NEW_TOKENS).pipe(
                Effect.asVoid
            ),
    ],
    ['touchLastSyncedAt', [], (s: Client) => touchLastSyncedAt(s, USER_ID, '2026-11-19T10:00:00Z')],
    [
        'findConnectionByStravaAthleteId',
        [],
        (s: Client) => findConnectionByStravaAthleteId(s, 12345).pipe(Effect.asVoid),
    ],
] as const

describe('strava connections repository failures', () => {
    it.each(operations)(
        '%s maps a thrown error to StravaConnectionError',
        async (_name, sent, run) => {
            const { supabase } = makeChain(ok(), leakyThrow(sent))

            const exit = await Effect.runPromiseExit(run(supabase))

            expect(failureTag(exit)).toBe('StravaConnectionError')
            expectNoSecrets(exit)
        }
    )

    it.each(operations)(
        '%s maps a returned error to StravaConnectionError',
        async (_name, sent, run) => {
            const { supabase } = makeChain({ data: null, error: leakyError(sent) })

            const exit = await Effect.runPromiseExit(run(supabase))

            expect(failureTag(exit)).toBe('StravaConnectionError')
            expectNoSecrets(exit)
        }
    )

    it('keeps the error code and the redacted message as the cause', async () => {
        const { supabase } = makeChain({
            data: null,
            error: leakyError([NEW_REFRESH_TOKEN]),
        })

        const exit = await Effect.runPromiseExit(
            updateTokensIfRefreshTokenMatches(supabase, USER_ID, REFRESH_TOKEN, NEW_TOKENS)
        )

        if (!Exit.isFailure(exit)) throw new Error('expected a failure')
        const failure = Cause.findErrorOption(exit.cause)
        expect(Option.isSome(failure) && String(failure.value.cause)).toBe(
            '23502: null value in column "scope" violates not-null constraint [redacted]'
        )
    })
})

describe('selectConnection', () => {
    it('reads the strava_connections row filtered by user_id', async () => {
        const { chain, from, supabase } = makeChain(ok(ROW))

        const result = await Effect.runPromise(selectConnection(supabase, USER_ID))

        expect(result).toEqual(ROW)
        expect(from).toHaveBeenCalledWith('strava_connections')
        expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chain.maybeSingle).toHaveBeenCalled()
    })

    it('returns null when the user has no connection', async () => {
        const { supabase } = makeChain(ok(null))

        const result = await Effect.runPromise(selectConnection(supabase, USER_ID))

        expect(result).toBeNull()
    })

    it('accepts a bigint athlete id returned as a string', async () => {
        const { supabase } = makeChain(ok({ ...ROW, strava_athlete_id: '12345' }))

        const result = await Effect.runPromise(selectConnection(supabase, USER_ID))

        expect(result?.strava_athlete_id).toBe(12345)
    })

    it('fails with StravaConnectionError without leaking tokens when the row is malformed', async () => {
        const { supabase } = makeChain(ok({ ...ROW, expires_at: null }))

        const exit = await Effect.runPromiseExit(selectConnection(supabase, USER_ID))

        expect(failureTag(exit)).toBe('StravaConnectionError')
        expectNoSecrets(exit)
    })
})

describe('upsertConnection', () => {
    it('upserts the row with user_id, keyed on user_id', async () => {
        const { chain, from, supabase } = makeChain(ok())
        const input = {
            strava_athlete_id: 12345,
            access_token: ACCESS_TOKEN,
            refresh_token: REFRESH_TOKEN,
            expires_at: ROW.expires_at,
            scope: ROW.scope,
        }

        await Effect.runPromise(upsertConnection(supabase, USER_ID, input))

        expect(from).toHaveBeenCalledWith('strava_connections')
        expect(chain.upsert).toHaveBeenCalledWith(
            { user_id: USER_ID, ...input },
            { onConflict: 'user_id' }
        )
    })
})

describe('deleteConnection', () => {
    it('deletes the row filtered by user_id', async () => {
        const { chain, supabase } = makeChain(ok())

        await Effect.runPromise(deleteConnection(supabase, USER_ID))

        expect(chain.delete).toHaveBeenCalled()
        expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    })
})

describe('updateTokensIfRefreshTokenMatches', () => {
    it('updates conditioned on user_id and the previous refresh token, returning true when a row changed', async () => {
        const { chain, supabase } = makeChain(ok([{ user_id: USER_ID }]))

        const changed = await Effect.runPromise(
            updateTokensIfRefreshTokenMatches(supabase, USER_ID, REFRESH_TOKEN, NEW_TOKENS)
        )

        expect(changed).toBe(true)
        expect(chain.update).toHaveBeenCalledWith(NEW_TOKENS)
        expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chain.eq).toHaveBeenCalledWith('refresh_token', REFRESH_TOKEN)
        expect(chain.select).toHaveBeenCalledWith('user_id')
    })

    it('returns false when no row matched the previous refresh token', async () => {
        const { supabase } = makeChain(ok([]))

        const changed = await Effect.runPromise(
            updateTokensIfRefreshTokenMatches(supabase, USER_ID, REFRESH_TOKEN, NEW_TOKENS)
        )

        expect(changed).toBe(false)
    })

    it('returns false when the update returns no data', async () => {
        const { supabase } = makeChain(ok(null))

        const changed = await Effect.runPromise(
            updateTokensIfRefreshTokenMatches(supabase, USER_ID, REFRESH_TOKEN, NEW_TOKENS)
        )

        expect(changed).toBe(false)
    })
})

describe('touchLastSyncedAt', () => {
    it('sets last_synced_at filtered by user_id', async () => {
        const { chain, supabase } = makeChain(ok())

        await Effect.runPromise(touchLastSyncedAt(supabase, USER_ID, '2026-11-19T10:00:00Z'))

        expect(chain.update).toHaveBeenCalledWith({ last_synced_at: '2026-11-19T10:00:00Z' })
        expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    })
})

describe('findConnectionByStravaAthleteId', () => {
    it('looks up the owning user by athlete id', async () => {
        const { chain, supabase } = makeChain(ok({ user_id: USER_ID }))

        const result = await Effect.runPromise(findConnectionByStravaAthleteId(supabase, 12345))

        expect(result).toEqual({ user_id: USER_ID })
        expect(chain.select).toHaveBeenCalledWith('user_id')
        expect(chain.eq).toHaveBeenCalledWith('strava_athlete_id', 12345)
        expect(chain.maybeSingle).toHaveBeenCalled()
    })

    it('returns null when no connection matches', async () => {
        const { supabase } = makeChain(ok(null))

        const result = await Effect.runPromise(findConnectionByStravaAthleteId(supabase, 999))

        expect(result).toBeNull()
    })
})
