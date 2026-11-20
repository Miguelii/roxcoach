// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    fetchLyftaWorkoutPage,
    validateLyftaApiKey,
} from '@/_bff/modules/lyfta/services/lyfta-api.service'

const API_KEY = 'test-lyfta-secret'

const PAGE = {
    status: true,
    total_pages: 1,
    current_page: 1,
    workouts: [],
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const jsonResponse = (body: JsonValue, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })

const rawResponse = (body: string, status = 200): Response =>
    new Response(body, {
        status,
        headers: { 'content-type': 'application/json' },
    })

describe('fetchLyftaWorkoutPage', () => {
    it('sends date bounds and the bearer key in headers only', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse({ ...PAGE, current_page: 2, total_pages: 2 }))

        const result = await Effect.runPromise(
            fetchLyftaWorkoutPage({
                apiKey: API_KEY,
                page: 2,
                range: { from: '2026-11-19', to: '2026-11-20' },
                fetcher,
            })
        )

        expect(result).toEqual({ currentPage: 2, totalPages: 2, workouts: [] })
        const [requestUrl, requestInit] = fetcher.mock.calls[0] ?? []
        expect(String(requestUrl)).toBe(
            'https://my.lyfta.app/api/v1/workouts?limit=100&page=2&from=2026-11-19&to=2026-11-20'
        )
        expect(String(requestUrl)).not.toContain(API_KEY)
        expect(new Headers(requestInit?.headers).get('authorization')).toBe(`Bearer ${API_KEY}`)
        expect(requestInit?.signal).toBeInstanceOf(AbortSignal)
    })

    it.each([
        [401, 'LyftaCredentialError'],
        [429, 'LyftaRateLimitError'],
        [503, 'LyftaApiError'],
    ])('maps HTTP %s to %s without retaining response content', async (status, tag) => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(rawResponse('private upstream body', status))
        const exit = await Effect.runPromiseExit(
            fetchLyftaWorkoutPage({ apiKey: API_KEY, page: 1, fetcher })
        )

        expect(failureTag(exit)).toBe(tag)
        expect(JSON.stringify(exit)).not.toContain(API_KEY)
        expect(JSON.stringify(exit)).not.toContain('private upstream body')
    })

    it('rejects invalid JSON and malformed page data without exposing the payload', async () => {
        const invalidJson = vi.fn<typeof fetch>().mockResolvedValue(rawResponse('{invalid'))
        const malformedPage = vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse({ workouts: 'secret' }))

        const invalidJsonExit = await Effect.runPromiseExit(
            fetchLyftaWorkoutPage({ apiKey: API_KEY, page: 1, fetcher: invalidJson })
        )
        const malformedPageExit = await Effect.runPromiseExit(
            fetchLyftaWorkoutPage({ apiKey: API_KEY, page: 1, fetcher: malformedPage })
        )

        expect(failureTag(invalidJsonExit)).toBe('LyftaResponseError')
        expect(failureTag(malformedPageExit)).toBe('LyftaResponseError')
        expect(JSON.stringify(malformedPageExit)).not.toContain('secret')
    })

    it('maps transport failures to a sanitized request error', async () => {
        const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(API_KEY))
        const exit = await Effect.runPromiseExit(
            fetchLyftaWorkoutPage({ apiKey: API_KEY, page: 1, fetcher })
        )

        expect(failureTag(exit)).toBe('LyftaApiRequestError')
        expect(JSON.stringify(exit)).not.toContain(API_KEY)
    })
})

describe('validateLyftaApiKey', () => {
    it('checks /me and validates a one-workout page before accepting the key', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse({ id: 123 }))
            .mockResolvedValueOnce(jsonResponse(PAGE))

        await expect(Effect.runPromise(validateLyftaApiKey(API_KEY, fetcher))).resolves.toEqual({
            currentPage: 1,
            totalPages: 1,
            workouts: [],
        })

        expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
            'https://my.lyfta.app/api/v1/me',
            'https://my.lyfta.app/api/v1/workouts?limit=1&page=1',
        ])
        expect(fetcher.mock.calls.every(([, init]) => init?.headers !== undefined)).toBe(true)
    })

    it('does not request workouts after /me rejects the key', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 401))
        const exit = await Effect.runPromiseExit(validateLyftaApiKey(API_KEY, fetcher))

        expect(failureTag(exit)).toBe('LyftaCredentialError')
        expect(fetcher).toHaveBeenCalledTimes(1)
    })
})
