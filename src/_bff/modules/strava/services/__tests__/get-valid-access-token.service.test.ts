// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cause, Effect, Exit, Option } from 'effect'
import { asClient, failureTag } from '@/_bff/lib/tests-utils'
import { getValidAccessToken } from '@/_bff/modules/strava/services/get-valid-access-token.service'
import { STRAVA_TOKEN_URL } from '@/_bff/modules/strava/constants'

type Row = {
    user_id: string
    strava_athlete_id: number
    access_token: string
    refresh_token: string
    expires_at: string
    scope: string
    connected_at: string | null
    last_synced_at: string | null
}
type Filter = [column: keyof Row, value: string | number]
type StravaEnv = {
    NEXT_STRAVA_CLIENT_ID: string | undefined
    NEXT_STRAVA_CLIENT_SECRET: string | undefined
}
type QueryResult = { data: Row | null | Row[] | { user_id: string }[]; error: null }

const { createDBAdminClientMock, env } = vi.hoisted(() => {
    const stravaEnv: StravaEnv = {
        NEXT_STRAVA_CLIENT_ID: 'client-id-1',
        NEXT_STRAVA_CLIENT_SECRET: 'client-secret-xyz',
    }
    return { createDBAdminClientMock: vi.fn(), env: stravaEnv }
})

vi.mock('@/_bff/core/db', () => ({ createDBAdminClient: createDBAdminClientMock }))
vi.mock('@/env/server', () => ({ ServerEnv: env }))

const USER_ID = 'user-1'
const NOW = new Date('2026-11-19T10:00:00.000Z')
const ACCESS_TOKEN = 'secret-access-token-abc'
const REFRESH_TOKEN = 'secret-refresh-token-def'
const NEW_ACCESS_TOKEN = 'secret-new-access-token-ghi'
const NEW_REFRESH_TOKEN = 'secret-new-refresh-token-jkl'
const WINNER_ACCESS_TOKEN = 'secret-winner-access-token-mno'
const WINNER_REFRESH_TOKEN = 'secret-winner-refresh-token-pqr'
const CLIENT_SECRET = 'client-secret-xyz'
const NEW_EXPIRES_AT_S = Math.floor(NOW.getTime() / 1000) + 6 * 3600

const inSeconds = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString()

const makeRow = (expiresAt: string): Row => ({
    user_id: USER_ID,
    strava_athlete_id: 12345,
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_at: expiresAt,
    scope: 'read,activity:read_all',
    connected_at: '2026-11-01T08:00:00+00:00',
    last_synced_at: null,
})

// In-memory strava_connections table supporting the query shapes the repository uses.
const makeFakeDb = (initial: Row[]) => {
    const rows = initial.map((row) => ({ ...row }))
    const updates: Partial<Row>[] = []

    const from = (table: string) => {
        if (table !== 'strava_connections') throw new Error(`unexpected table ${table}`)
        const filters: Filter[] = []
        let patch: Partial<Row> | null = null
        let single = false

        const matches = () =>
            rows.filter((row) => filters.every(([column, value]) => row[column] === value))

        const run = (): QueryResult => {
            if (patch !== null) {
                const changed = matches()
                for (const row of changed) Object.assign(row, patch)
                updates.push(patch)
                return { data: changed.map((row) => ({ user_id: row.user_id })), error: null }
            }
            const found = matches()
            return { data: single ? (found[0] ?? null) : found, error: null }
        }

        // Settles on the next microtask, after the synchronous builder calls have set the query.
        const settled = new Promise<QueryResult>((resolve) => {
            queueMicrotask(() => resolve(run()))
        })
        const chain = Object.assign(settled, {
            select: () => chain,
            update: (values: Partial<Row>) => {
                patch = values
                return chain
            },
            eq: (column: keyof Row, value: string | number) => {
                filters.push([column, value])
                return chain
            },
            maybeSingle: () => {
                single = true
                return chain
            },
        })
        return chain
    }

    return { rows, updates, supabase: asClient({ from }) }
}

const fetchMock = vi.fn()

const tokenResponse = (accessToken: string, refreshToken: string) =>
    new Response(
        JSON.stringify({
            token_type: 'Bearer',
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: NEW_EXPIRES_AT_S,
            expires_in: 21600,
        }),
        { status: 200 }
    )

const SECRETS = [
    ACCESS_TOKEN,
    REFRESH_TOKEN,
    NEW_ACCESS_TOKEN,
    NEW_REFRESH_TOKEN,
    WINNER_ACCESS_TOKEN,
    WINNER_REFRESH_TOKEN,
    CLIENT_SECRET,
]

const expectNoSecrets = (exit: Exit.Exit<string, { cause: unknown }>) => {
    if (!Exit.isFailure(exit)) throw new Error('expected a failure')
    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isNone(failure)) throw new Error('expected a typed failure')
    const serialized = JSON.stringify(failure.value)
    const exitSerialized = JSON.stringify(exit)
    const message = failure.value instanceof Error ? failure.value.message : ''
    for (const secret of SECRETS) {
        expect(serialized).not.toContain(secret)
        expect(exitSerialized).not.toContain(secret)
        expect(String(failure.value.cause)).not.toContain(secret)
        expect(message).not.toContain(secret)
    }
}

describe('getValidAccessToken', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(NOW)
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
        createDBAdminClientMock.mockReset()
        env.NEXT_STRAVA_CLIENT_ID = 'client-id-1'
        env.NEXT_STRAVA_CLIENT_SECRET = CLIENT_SECRET
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('returns the stored token with no HTTP call while it is fresh', async () => {
        const db = makeFakeDb([makeRow(inSeconds(3600))])
        createDBAdminClientMock.mockReturnValue(db.supabase)

        const token = await Effect.runPromise(getValidAccessToken(USER_ID))

        expect(token).toBe(ACCESS_TOKEN)
        expect(fetchMock).not.toHaveBeenCalled()
        expect(db.updates).toHaveLength(0)
    })

    it('does not need the client credentials while the token is fresh', async () => {
        env.NEXT_STRAVA_CLIENT_SECRET = undefined
        createDBAdminClientMock.mockReturnValue(makeFakeDb([makeRow(inSeconds(3600))]).supabase)

        const token = await Effect.runPromise(getValidAccessToken(USER_ID))

        expect(token).toBe(ACCESS_TOKEN)
    })

    it('refreshes once inside the margin, saves the rotated tokens, then returns the new token', async () => {
        const db = makeFakeDb([makeRow(inSeconds(300))])
        createDBAdminClientMock.mockReturnValue(db.supabase)
        fetchMock.mockImplementation(async () => {
            // Nothing is saved before Strava answers.
            expect(db.updates).toHaveLength(0)
            return tokenResponse(NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN)
        })

        const token = await Effect.runPromise(getValidAccessToken(USER_ID))

        expect(token).toBe(NEW_ACCESS_TOKEN)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(STRAVA_TOKEN_URL)
        expect(init.method).toBe('POST')
        expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
            client_id: 'client-id-1',
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: REFRESH_TOKEN,
        })
        expect(db.rows[0]).toMatchObject({
            access_token: NEW_ACCESS_TOKEN,
            refresh_token: NEW_REFRESH_TOKEN,
            expires_at: new Date(NEW_EXPIRES_AT_S * 1000).toISOString(),
        })
        expect(db.rows[0].expires_at).toBe(inSeconds(6 * 3600))
    })

    it('refreshes a token that is already expired', async () => {
        const db = makeFakeDb([makeRow(inSeconds(-60))])
        createDBAdminClientMock.mockReturnValue(db.supabase)
        fetchMock.mockResolvedValue(tokenResponse(NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN))

        const token = await Effect.runPromise(getValidAccessToken(USER_ID))

        expect(token).toBe(NEW_ACCESS_TOKEN)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('uses the winner token without a second refresh when another job refreshed first', async () => {
        const db = makeFakeDb([makeRow(inSeconds(300))])
        createDBAdminClientMock.mockReturnValue(db.supabase)
        fetchMock.mockImplementation(async () => {
            // A concurrent job wins the race and stores its rotated tokens first.
            Object.assign(db.rows[0], {
                access_token: WINNER_ACCESS_TOKEN,
                refresh_token: WINNER_REFRESH_TOKEN,
                expires_at: inSeconds(6 * 3600),
            })
            return tokenResponse(NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN)
        })

        const token = await Effect.runPromise(getValidAccessToken(USER_ID))

        expect(token).toBe(WINNER_ACCESS_TOKEN)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(db.rows[0].refresh_token).toBe(WINNER_REFRESH_TOKEN)
        expect(db.rows[0].access_token).toBe(WINNER_ACCESS_TOKEN)
    })

    it('fails with StravaNotConnectedError when the connection disappears during the race', async () => {
        const db = makeFakeDb([makeRow(inSeconds(300))])
        createDBAdminClientMock.mockReturnValue(db.supabase)
        fetchMock.mockImplementation(async () => {
            db.rows.splice(0, 1)
            return tokenResponse(NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN)
        })

        const exit = await Effect.runPromiseExit(getValidAccessToken(USER_ID))

        expect(failureTag(exit)).toBe('StravaNotConnectedError')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expectNoSecrets(exit)
    })

    it('fails with StravaNotConnectedError when there is no connection', async () => {
        createDBAdminClientMock.mockReturnValue(makeFakeDb([]).supabase)

        const exit = await Effect.runPromiseExit(getValidAccessToken(USER_ID))

        expect(failureTag(exit)).toBe('StravaNotConnectedError')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('reads only the row of the given user', async () => {
        createDBAdminClientMock.mockReturnValue(
            makeFakeDb([{ ...makeRow(inSeconds(3600)), user_id: 'user-2' }]).supabase
        )

        const exit = await Effect.runPromiseExit(getValidAccessToken(USER_ID))

        expect(failureTag(exit)).toBe('StravaNotConnectedError')
    })

    it('fails with StravaUnauthorizedError on a 401 and leaves the stored row untouched', async () => {
        const original = makeRow(inSeconds(300))
        const db = makeFakeDb([original])
        createDBAdminClientMock.mockReturnValue(db.supabase)
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ message: 'Authorization Error' }), { status: 401 })
        )

        const exit = await Effect.runPromiseExit(getValidAccessToken(USER_ID))

        expect(failureTag(exit)).toBe('StravaUnauthorizedError')
        expect(db.rows[0]).toEqual(original)
        expect(db.updates).toHaveLength(0)
        expectNoSecrets(exit)
    })

    it('never leaks a token or the client secret when the refresh request throws', async () => {
        createDBAdminClientMock.mockReturnValue(makeFakeDb([makeRow(inSeconds(300))]).supabase)
        fetchMock.mockRejectedValue(
            new Error(`connect failed for ${REFRESH_TOKEN} with ${CLIENT_SECRET}`)
        )

        const exit = await Effect.runPromiseExit(getValidAccessToken(USER_ID))

        expect(failureTag(exit)).toBe('StravaApiError')
        expectNoSecrets(exit)
    })

    it.each([
        ['NEXT_STRAVA_CLIENT_ID', 'client id'],
        ['NEXT_STRAVA_CLIENT_SECRET', 'client secret'],
    ] as const)(
        'fails with StravaNotConfiguredError when %s is unset and a refresh is needed',
        async (name, _label) => {
            env[name] = undefined
            createDBAdminClientMock.mockReturnValue(makeFakeDb([makeRow(inSeconds(300))]).supabase)

            const exit = await Effect.runPromiseExit(getValidAccessToken(USER_ID))

            expect(failureTag(exit)).toBe('StravaNotConfiguredError')
            expect(fetchMock).not.toHaveBeenCalled()
            expectNoSecrets(exit)
        }
    )

    it('fails with CreateSbClientError when the admin client cannot be created', async () => {
        createDBAdminClientMock.mockImplementation(() => {
            throw new Error('missing service role key')
        })

        const exit = await Effect.runPromiseExit(getValidAccessToken(USER_ID))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})
