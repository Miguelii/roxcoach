import { describe, expect, it } from 'vitest'
import { runGeminiSmoke } from '../gemini-smoke'

type Call = { url: string; init: RequestInit | undefined }

const KEY = 'test-key-abc123'

function fakeFetch(status: number, calls: Call[] = []): typeof fetch {
    return async (input, init) => {
        calls.push({ url: String(input), init })
        return new Response('{"secret":"body"}', { status })
    }
}

describe('runGeminiSmoke', () => {
    it('returns ok on a 200', async () => {
        expect(await runGeminiSmoke({ apiKey: KEY, model: 'm1', fetch: fakeFetch(200) })).toBe('ok')
    })

    it.each([429, 403, 400])('returns the status on a %i', async (status) => {
        const result = await runGeminiSmoke({ apiKey: KEY, model: 'm1', fetch: fakeFetch(status) })
        expect(result).toEqual({ status })
    })

    it('returns network when fetch throws', async () => {
        const throwing: typeof fetch = async () => {
            throw new Error(`boom ${KEY}`)
        }
        const result = await runGeminiSmoke({ apiKey: KEY, model: 'm1', fetch: throwing })
        expect(result).toEqual({ status: 'network' })
    })

    it('returns no-key without calling fetch', async () => {
        const calls: Call[] = []
        const result = await runGeminiSmoke({
            apiKey: undefined,
            model: 'm1',
            fetch: fakeFetch(200, calls),
        })
        expect(result).toEqual({ status: 'no-key' })
        expect(calls).toHaveLength(0)
    })

    it('sends the key in a header, the model in the url, and never leaks the key', async () => {
        const calls: Call[] = []
        const result = await runGeminiSmoke({
            apiKey: KEY,
            model: 'my-model',
            fetch: fakeFetch(403, calls),
        })
        expect(calls).toHaveLength(1)
        const call = calls[0]
        expect(call.url).toContain('generativelanguage.googleapis.com')
        expect(call.url).toContain('my-model:generateContent')
        expect(call.url).not.toContain(KEY)
        expect(new Headers(call.init?.headers).get('x-goog-api-key')).toBe(KEY)
        expect(JSON.stringify(result)).not.toContain(KEY)
    })

    it('falls back to the default model when none is given', async () => {
        const calls: Call[] = []
        await runGeminiSmoke({ apiKey: KEY, model: undefined, fetch: fakeFetch(200, calls) })
        expect(calls[0].url).toMatch(/models\/[\w.-]+:generateContent/)
    })
})
