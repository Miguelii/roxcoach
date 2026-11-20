import { describe, expect, it } from 'vitest'
import { COACH_MODELS } from '@/_bff/core/constants/coach-models.constants'
import { runGeminiSmoke, runModelChecks } from '../gemini-smoke'

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
})

describe('runModelChecks', () => {
    const ids = COACH_MODELS.map((m) => m.id)

    it('checks every listed model in order, one line each', async () => {
        const calls: Call[] = []
        const lines: string[] = []
        const ok = await runModelChecks({
            apiKey: KEY,
            fetch: fakeFetch(200, calls),
            print: (l) => lines.push(l),
        })
        expect(ok).toBe(true)
        expect(lines).toEqual(ids.map((id) => `${id}: OK`))
        expect(calls.map((c) => c.url)).toEqual(
            ids.map((id) => expect.stringContaining(`${id}:generateContent`))
        )
    })

    it('checks only the id given as an argument', async () => {
        const calls: Call[] = []
        const lines: string[] = []
        await runModelChecks({
            apiKey: KEY,
            modelId: 'gemini-3.8-flash',
            fetch: fakeFetch(200, calls),
            print: (l) => lines.push(l),
        })
        expect(calls).toHaveLength(1)
        expect(lines).toEqual(['gemini-3.8-flash: OK'])
    })

    it('prints each model its own status', async () => {
        const lines: string[] = []
        const perModel: typeof fetch = async (input) =>
            new Response('{}', { status: String(input).includes(ids[0]) ? 429 : 200 })
        const ok = await runModelChecks({
            apiKey: KEY,
            fetch: perModel,
            print: (l) => lines.push(l),
        })
        expect(ok).toBe(false)
        expect(lines[0]).toBe(`${ids[0]}: 429`)
        expect(lines[1]).toBe(`${ids[1]}: OK`)
    })

    it('prints no-key per model without calling fetch and never prints the key', async () => {
        const calls: Call[] = []
        const lines: string[] = []
        await runModelChecks({
            apiKey: undefined,
            fetch: fakeFetch(200, calls),
            print: (l) => lines.push(l),
        })
        expect(calls).toHaveLength(0)
        expect(lines).toEqual(ids.map((id) => `${id}: no-key`))
    })

    it('never prints the key or a response body', async () => {
        const lines: string[] = []
        await runModelChecks({
            apiKey: KEY,
            fetch: fakeFetch(403),
            print: (l) => lines.push(l),
        })
        const out = lines.join('\n')
        expect(out).not.toContain(KEY)
        expect(out).not.toContain('secret')
    })
})
