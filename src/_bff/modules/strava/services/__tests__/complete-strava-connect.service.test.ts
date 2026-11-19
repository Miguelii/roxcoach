// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { EnqueueStravaJobError } from '@/_bff/lib/errors'
import { completeStravaConnect } from '@/_bff/modules/strava/services/complete-strava-connect.service'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'
import { fetchMock, json, USER_ID } from '@/_bff/modules/strava/services/__tests__/sync-fixtures'

type CallbackInput = Parameters<typeof completeStravaConnect>[0]

const { createDBAdminClientMock, enqueueBackfillMock } = vi.hoisted(() => ({
    createDBAdminClientMock: vi.fn(),
    enqueueBackfillMock: vi.fn(),
}))

vi.mock('@/_bff/core/db', () => ({ createDBAdminClient: createDBAdminClientMock }))
vi.mock('@/env/server', () => ({
    ServerEnv: {
        NEXT_STRAVA_CLIENT_ID: 'client-id-1',
        NEXT_STRAVA_CLIENT_SECRET: 'client-secret-xyz',
    },
}))
vi.mock('@/_bff/modules/strava/services/enqueue-strava-jobs.service', () => ({
    enqueueBackfill: enqueueBackfillMock,
}))

const CLIENT_SECRET = 'client-secret-xyz'
const STATE = 'f'.repeat(64)
const CODE = 'auth-code-123'
const NEW_ACCESS_TOKEN = 'secret-new-access-token-ghi'
const NEW_REFRESH_TOKEN = 'secret-new-refresh-token-jkl'
const ATHLETE_ID = 424242
const EXPIRES_AT_S = 1_795_000_000
const NOW = new Date('2026-11-19T10:00:00.000Z')

const input = (overrides: Partial<CallbackInput> = {}): CallbackInput => ({
    userId: USER_ID,
    code: CODE,
    scope: 'read,activity:read_all',
    state: STATE,
    error: null,
    stateCookie: STATE,
    ...overrides,
})

// A token response without `athlete` (Strava only sends it on the code exchange).
const tokenBodyWithoutAthlete = () => ({
    token_type: 'Bearer',
    access_token: NEW_ACCESS_TOKEN,
    refresh_token: NEW_REFRESH_TOKEN,
    expires_at: EXPIRES_AT_S,
    expires_in: 21600,
})

const tokenBody = () => ({
    ...tokenBodyWithoutAthlete(),
    athlete: { id: ATHLETE_ID, firstname: 'Ana' },
})

const useDb = () => {
    const db = makeFakeAdminDb(() => ok())
    createDBAdminClientMock.mockReturnValue(db.supabase)
    return db
}

const connectionWrites = (db: ReturnType<typeof useDb>) =>
    db.calls.filter((call) => call.table === 'strava_connections' && call.op !== 'select')

describe('completeStravaConnect', () => {
    let fetchSpy: ReturnType<typeof fetchMock>

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(NOW)
        fetchSpy = fetchMock()
        vi.stubGlobal('fetch', fetchSpy)
        createDBAdminClientMock.mockReset()
        enqueueBackfillMock.mockReset().mockReturnValue(Effect.void)
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it.each([
        ['a state that does not match the cookie', { state: 'e'.repeat(64) }],
        ['a state of another length', { state: 'f'.repeat(10) }],
        ['a missing state', { state: null }],
        ['a missing cookie', { stateCookie: null }],
        ['an empty state and cookie', { state: '', stateCookie: '' }],
    ])(
        'fails with StravaOAuthStateError for %s and exchanges nothing',
        async (_label, overrides) => {
            const db = useDb()

            const exit = await Effect.runPromiseExit(completeStravaConnect(input(overrides)))

            expect(failureTag(exit)).toBe('StravaOAuthStateError')
            expect(fetchSpy).not.toHaveBeenCalled()
            expect(connectionWrites(db)).toHaveLength(0)
            expect(enqueueBackfillMock).not.toHaveBeenCalled()
        }
    )

    it('checks the state even when Strava reports a denial', async () => {
        const exit = await Effect.runPromiseExit(
            completeStravaConnect(input({ state: 'e'.repeat(64), error: 'access_denied' }))
        )

        expect(failureTag(exit)).toBe('StravaOAuthStateError')
    })

    it.each([
        ['error=access_denied', { error: 'access_denied', code: null }],
        ['an error with a code', { error: 'access_denied' }],
        ['a missing code', { code: null }],
        ['an empty code', { code: '' }],
    ])('returns denied for %s and stores nothing', async (_label, overrides) => {
        const db = useDb()

        const exit = await Effect.runPromiseExit(completeStravaConnect(input(overrides)))

        expect(successValue(exit)).toBe('denied')
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(connectionWrites(db)).toHaveLength(0)
    })

    it.each([
        ['read only', 'read'],
        ['activity:read only (not read_all)', 'read,activity:read'],
        ['a lookalike scope', 'read,activity:read_all_extra'],
        ['an empty scope', ''],
        ['a missing scope', null],
    ])('returns scope for %s and stores nothing', async (_label, scope) => {
        const db = useDb()

        const exit = await Effect.runPromiseExit(completeStravaConnect(input({ scope })))

        expect(successValue(exit)).toBe('scope')
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(connectionWrites(db)).toHaveLength(0)
        expect(enqueueBackfillMock).not.toHaveBeenCalled()
    })

    it('exchanges the code, saves the tokens with the athlete id from the token response and enqueues one backfill', async () => {
        const db = useDb()
        fetchSpy.mockResolvedValue(json(tokenBody()))

        const exit = await Effect.runPromiseExit(completeStravaConnect(input()))

        expect(successValue(exit)).toBe('connected')

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        const [url, init] = fetchSpy.mock.calls[0]
        expect(url).toBe('https://www.strava.com/oauth/token')
        expect(init?.method).toBe('POST')
        expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
            client_id: 'client-id-1',
            client_secret: CLIENT_SECRET,
            code: CODE,
            grant_type: 'authorization_code',
        })

        const writes = connectionWrites(db)
        expect(writes).toHaveLength(1)
        expect(writes[0].op).toBe('upsert')
        expect(writes[0].payload).toEqual({
            user_id: USER_ID,
            strava_athlete_id: ATHLETE_ID,
            access_token: NEW_ACCESS_TOKEN,
            refresh_token: NEW_REFRESH_TOKEN,
            expires_at: new Date(EXPIRES_AT_S * 1000).toISOString(),
            scope: 'read,activity:read_all',
            connected_at: NOW.toISOString(),
        })

        expect(enqueueBackfillMock).toHaveBeenCalledTimes(1)
        expect(enqueueBackfillMock).toHaveBeenCalledWith(USER_ID)
    })

    it('fails with StravaPayloadError and stores nothing when the token response has no athlete', async () => {
        const db = useDb()
        fetchSpy.mockResolvedValue(json(tokenBodyWithoutAthlete()))

        const exit = await Effect.runPromiseExit(completeStravaConnect(input()))

        expect(failureTag(exit)).toBe('StravaPayloadError')
        expect(connectionWrites(db)).toHaveLength(0)
        expect(enqueueBackfillMock).not.toHaveBeenCalled()
    })

    it('maps a replayed code (Strava answers 400) to StravaApiError and stores nothing', async () => {
        const db = useDb()
        fetchSpy.mockResolvedValue(json({ message: 'Bad Request', errors: [] }, 400))

        const exit = await Effect.runPromiseExit(completeStravaConnect(input()))

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(connectionWrites(db)).toHaveLength(0)
        expect(enqueueBackfillMock).not.toHaveBeenCalled()
    })

    it('fails on a 401 from the token endpoint without deleting anything', async () => {
        const db = useDb()
        fetchSpy.mockResolvedValue(json({ message: 'Authorization Error' }, 401))

        const exit = await Effect.runPromiseExit(completeStravaConnect(input()))

        expect(failureTag(exit)).toBe('StravaUnauthorizedError')
        expect(connectionWrites(db)).toHaveLength(0)
    })

    it('still connects when the backfill cannot be enqueued', async () => {
        const db = useDb()
        fetchSpy.mockResolvedValue(json(tokenBody()))
        enqueueBackfillMock.mockReturnValue(
            Effect.fail(
                new EnqueueStravaJobError({
                    cause: 'trigger down',
                    error_hash: ErrorCode.STRAVA_ENQUEUE_TRIGGER,
                })
            )
        )

        const exit = await Effect.runPromiseExit(completeStravaConnect(input()))

        expect(successValue(exit)).toBe('connected')
        expect(connectionWrites(db)).toHaveLength(1)
        expect(db.calls.some((call) => call.op === 'delete')).toBe(false)
    })

    it('keeps the tokens and the client secret out of a storage failure', async () => {
        const db = makeFakeAdminDb(() => ({
            error: {
                code: '23505',
                message: `duplicate key ${NEW_ACCESS_TOKEN} ${NEW_REFRESH_TOKEN}`,
            },
        }))
        createDBAdminClientMock.mockReturnValue(db.supabase)
        fetchSpy.mockResolvedValue(json(tokenBody()))

        const exit = await Effect.runPromiseExit(completeStravaConnect(input()))

        expect(failureTag(exit)).toBe('StravaConnectionError')
        expect(Exit.isFailure(exit)).toBe(true)
        const serialized = JSON.stringify(exit)
        for (const secret of [NEW_ACCESS_TOKEN, NEW_REFRESH_TOKEN, CLIENT_SECRET, CODE])
            expect(serialized).not.toContain(secret)
        expect(enqueueBackfillMock).not.toHaveBeenCalled()
    })
})
