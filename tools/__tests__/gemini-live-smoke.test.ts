import { describe, expect, it } from 'vitest'
import { liveTokenRequestBody } from '@/_bff/core/constants/transcribe-live.constants'
import { createLiveToken, pcmChunksFromWav, redact } from '../gemini-live-smoke'

type Call = { url: string; init: RequestInit | undefined }

const KEY = 'test-key-abc123'
const NOW = new Date('2026-11-26T10:00:00.000Z')

function fakeFetch(status: number, body: string, calls: Call[] = []): typeof fetch {
    return async (input, init) => {
        calls.push({ url: String(input), init })
        return new Response(body, { status })
    }
}

describe('createLiveToken', () => {
    it('returns no-key without calling fetch', async () => {
        const calls: Call[] = []
        const result = await createLiveToken({
            apiKey: undefined,
            now: NOW,
            fetch: fakeFetch(200, '{}', calls),
        })
        expect(result).toEqual({ status: 'no-key' })
        expect(calls).toHaveLength(0)
    })

    it('posts the shared token request and returns the parsed body', async () => {
        const calls: Call[] = []
        const result = await createLiveToken({
            apiKey: KEY,
            now: NOW,
            fetch: fakeFetch(200, '{"name":"auth_tokens/xyz"}', calls),
        })
        expect(result).toEqual({ ok: true, body: { name: 'auth_tokens/xyz' } })
        expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens')
        expect(new Headers(calls[0]?.init?.headers).get('x-goog-api-key')).toBe(KEY)
        expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(liveTokenRequestBody(NOW))
    })

    it('returns the status and body text on a non-2xx answer', async () => {
        const result = await createLiveToken({
            apiKey: KEY,
            now: NOW,
            fetch: fakeFetch(400, 'bad constraints'),
        })
        expect(result).toEqual({ status: 400, body: 'bad constraints' })
    })
})

describe('pcmChunksFromWav', () => {
    it('skips the 44 byte header and splits into 3200 byte chunks', () => {
        const wav = new Uint8Array(44 + 3200 + 1000).fill(1)
        const chunks = pcmChunksFromWav(wav)
        expect(chunks.map((chunk) => chunk.byteLength)).toEqual([3200, 1000])
    })
})

describe('redact', () => {
    it('shortens long strings anywhere in the body and keeps short ones', () => {
        const body = { name: 'auth_tokens/abcdefghijklmnopqrstuvwxyz', uses: 1, ok: 'short' }
        expect(JSON.parse(redact(JSON.stringify(body)))).toEqual({
            name: 'auth_t...',
            uses: 1,
            ok: 'short',
        })
    })
})
