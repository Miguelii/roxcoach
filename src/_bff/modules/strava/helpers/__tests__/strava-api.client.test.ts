import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cause, Effect, Exit, Option } from 'effect'
import { z } from 'zod'
import { stravaApiGet, stravaOAuthPost } from '@/_bff/modules/strava/helpers/strava-api.client'
import { STRAVA_API_BASE } from '@/_bff/modules/strava/constants'
import { failureTag } from '@/_bff/lib/tests-utils'

const TOKEN = 'secret-access-token-123'
const schema = z.object({ id: z.number() })

const fetchMock = vi.fn()

const jsonResponse = (
    body: Record<string, string | number>,
    status = 200,
    headers: Record<string, string> = {}
) => new Response(JSON.stringify(body), { status, headers })

type StravaFailure = { cause: unknown; retryAfterS?: number | null; status?: number | null }

const failureOf = (exit: Exit.Exit<unknown, StravaFailure>): StravaFailure => {
    if (!Exit.isFailure(exit)) throw new Error('expected a failure')
    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isNone(failure)) throw new Error('expected a typed failure')
    return failure.value
}

describe('stravaApiGet', () => {
    beforeEach(() => {
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('sends the bearer token to the base url with the query and parses the body', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 7, extra: 'ignored' }))

        const result = await Effect.runPromise(
            stravaApiGet('/athlete/activities', TOKEN, schema, { per_page: 100, page: 2 })
        )

        expect(result).toEqual({ id: 7 })
        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe(`${STRAVA_API_BASE}/athlete/activities?per_page=100&page=2`)
        expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    })

    it('omits the query string when no query is given', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 1 }))

        await Effect.runPromise(stravaApiGet('/activities/1', TOKEN, schema))

        expect(fetchMock.mock.calls[0][0]).toBe(`${STRAVA_API_BASE}/activities/1`)
    })

    it.each([401, 403])('maps status %i to StravaUnauthorizedError', async (status) => {
        fetchMock.mockResolvedValue(jsonResponse({}, status))

        const exit = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))

        expect(failureTag(exit)).toBe('StravaUnauthorizedError')
    })

    it('maps 404 to StravaNotFoundError', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, 404))

        const exit = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))

        expect(failureTag(exit)).toBe('StravaNotFoundError')
    })

    it('maps 429 to StravaRateLimitedError with retryAfterS from Retry-After', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, 429, { 'Retry-After': '120' }))

        const exit = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))

        expect(failureTag(exit)).toBe('StravaRateLimitedError')
        expect(failureOf(exit).retryAfterS).toBe(120)
    })

    it('gives retryAfterS null when Retry-After is absent or not a number', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 429))
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 429, { 'Retry-After': 'soon' }))

        const first = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))
        const second = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))

        expect(failureOf(first).retryAfterS).toBeNull()
        expect(failureOf(second).retryAfterS).toBeNull()
    })

    it('maps 500 to StravaApiError with the status', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, 500))

        const exit = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(failureOf(exit).status).toBe(500)
    })

    it('maps a network rejection to StravaApiError with a null status', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'))

        const exit = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(failureOf(exit).status).toBeNull()
    })

    it('maps a body that fails the schema to StravaApiError', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 'not-a-number' }))

        const exit = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))

        expect(failureTag(exit)).toBe('StravaApiError')
        expect(failureOf(exit).status).toBe(200)
    })

    it('maps a body that is not json to StravaApiError', async () => {
        fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }))

        const exit = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))

        expect(failureTag(exit)).toBe('StravaApiError')
    })

    it.each([
        ['401', () => Promise.resolve(jsonResponse({}, 401))],
        ['404', () => Promise.resolve(jsonResponse({}, 404))],
        ['429', () => Promise.resolve(jsonResponse({}, 429))],
        ['500', () => Promise.resolve(jsonResponse({}, 500))],
        ['schema failure', () => Promise.resolve(jsonResponse({ id: 'bad' }))],
        [
            'network error carrying the token',
            () => Promise.reject(new Error(`boom Bearer ${TOKEN}`)),
        ],
    ])('never leaks the access token into the error (%s)', async (_label, respond) => {
        fetchMock.mockImplementationOnce(respond)

        const exit = await Effect.runPromiseExit(stravaApiGet('/x', TOKEN, schema))
        const failure = failureOf(exit)

        expect(JSON.stringify(failure)).not.toContain(TOKEN)
        expect(String(failure.cause)).not.toContain(TOKEN)
    })
})

describe('stravaOAuthPost', () => {
    const url = 'https://www.strava.com/oauth/token'

    beforeEach(() => {
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('posts a form-encoded body and parses the response', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 3 }))

        const result = await Effect.runPromise(
            stravaOAuthPost(url, { grant_type: 'refresh_token', refresh_token: 'r&1' }, schema)
        )

        expect(result).toEqual({ id: 3 })
        const [calledUrl, init] = fetchMock.mock.calls[0]
        expect(calledUrl).toBe(url)
        expect(init.method).toBe('POST')
        expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
        expect(init.body).toBe('grant_type=refresh_token&refresh_token=r%261')
    })

    it.each([401, 403])('maps status %i to StravaUnauthorizedError', async (status) => {
        fetchMock.mockResolvedValue(jsonResponse({}, status))

        const exit = await Effect.runPromiseExit(stravaOAuthPost(url, {}, schema))

        expect(failureTag(exit)).toBe('StravaUnauthorizedError')
    })

    it('maps 429 to StravaRateLimitedError with retryAfterS', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, 429, { 'Retry-After': '30' }))

        const exit = await Effect.runPromiseExit(stravaOAuthPost(url, {}, schema))

        expect(failureTag(exit)).toBe('StravaRateLimitedError')
        expect(failureOf(exit).retryAfterS).toBe(30)
    })

    it('maps other statuses, network errors and schema failures to StravaApiError', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({}, 400))
        fetchMock.mockRejectedValueOnce(new Error('offline'))
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'bad' }))

        const http = await Effect.runPromiseExit(stravaOAuthPost(url, {}, schema))
        const network = await Effect.runPromiseExit(stravaOAuthPost(url, {}, schema))
        const parse = await Effect.runPromiseExit(stravaOAuthPost(url, {}, schema))

        expect(failureTag(http)).toBe('StravaApiError')
        expect(failureOf(http).status).toBe(400)
        expect(failureTag(network)).toBe('StravaApiError')
        expect(failureOf(network).status).toBeNull()
        expect(failureTag(parse)).toBe('StravaApiError')
    })

    it('never leaks the body values into an error', async () => {
        fetchMock.mockResolvedValue(jsonResponse({}, 400))

        const exit = await Effect.runPromiseExit(
            stravaOAuthPost(url, { client_secret: 'top-secret-value' }, schema)
        )

        expect(JSON.stringify(failureOf(exit))).not.toContain('top-secret-value')
    })
})
