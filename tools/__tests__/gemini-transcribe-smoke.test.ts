import { describe, expect, it } from 'vitest'
import { mimeTypeFor, runTranscribeSmoke } from '../gemini-transcribe-smoke'

type Call = { url: string; init: RequestInit | undefined }

const KEY = 'test-key-abc123'
const BYTES = new Uint8Array([1, 2, 3, 250])

function fakeFetch(status: number, body: string, calls: Call[] = []): typeof fetch {
    return async (input, init) => {
        calls.push({ url: String(input), init })
        return new Response(body, { status })
    }
}

describe('runTranscribeSmoke', () => {
    it('returns no-key without calling fetch', async () => {
        const calls: Call[] = []
        const result = await runTranscribeSmoke({
            apiKey: undefined,
            bytes: BYTES,
            mimeType: 'audio/webm',
            fetch: fakeFetch(200, '{}', calls),
        })
        expect(result).toEqual({ status: 'no-key' })
        expect(calls).toHaveLength(0)
    })

    it('posts the clip inline to the interactions endpoint and returns the parsed body', async () => {
        const calls: Call[] = []
        const result = await runTranscribeSmoke({
            apiKey: KEY,
            bytes: BYTES,
            mimeType: 'audio/webm',
            fetch: fakeFetch(200, '{"outputs":[]}', calls),
        })
        expect(result).toEqual({ ok: true, body: { outputs: [] } })
        expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
        expect(new Headers(calls[0]?.init?.headers).get('x-goog-api-key')).toBe(KEY)
        expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
            model: 'gemini-3.5-transcribe',
            input: [
                {
                    type: 'audio',
                    data: Buffer.from(BYTES).toString('base64'),
                    mime_type: 'audio/webm',
                },
            ],
            generation_config: { transcription_config: { mode: 'smart' } },
        })
    })

    it('returns the status and the body text on a non-2xx answer', async () => {
        const result = await runTranscribeSmoke({
            apiKey: KEY,
            bytes: BYTES,
            mimeType: 'audio/mp4',
            fetch: fakeFetch(400, 'bad mime'),
        })
        expect(result).toEqual({ status: 400, body: 'bad mime' })
    })

    it('returns network when fetch throws', async () => {
        const throwing: typeof fetch = async () => {
            throw new Error(`boom ${KEY}`)
        }
        const result = await runTranscribeSmoke({
            apiKey: KEY,
            bytes: BYTES,
            mimeType: 'audio/webm',
            fetch: throwing,
        })
        expect(result).toEqual({ status: 'network' })
    })
})

describe('mimeTypeFor', () => {
    it.each([
        ['clip.webm', 'audio/webm'],
        ['clip.m4a', 'audio/mp4'],
        ['clip.MP4', 'audio/mp4'],
        ['clip.mp3', 'audio/mpeg'],
        ['clip.wav', 'audio/wav'],
        ['clip.ogg', 'audio/ogg'],
    ])('maps %s to %s', (file, mime) => {
        expect(mimeTypeFor(file)).toBe(mime)
    })

    it('returns null for an unknown extension', () => {
        expect(mimeTypeFor('clip.flac')).toBeNull()
    })
})
