// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGeminiTranscriber } from '@/_bff/modules/coach/providers/gemini-transcriber'

type Call = { url: string; init: RequestInit | undefined }

const KEY = 'test-key-abc123'
const BYTES = new Uint8Array([1, 2, 3, 250])

const completed = (...texts: string[]) => ({
    id: 'interactions/abc',
    status: 'completed',
    steps: [
        {
            id: 'step_001',
            type: 'model_output',
            content: texts.map((text) => ({ type: 'text', text, annotations: [] })),
        },
    ],
})

const fakeFetch = (respond: () => Response | Promise<Response>, calls: Call[] = []) =>
    vi.fn<typeof fetch>(async (input, init) => {
        calls.push({ url: String(input), init })
        return respond()
    })

const transcriberWith = (doFetch: typeof fetch, timeoutMs = 30_000) =>
    createGeminiTranscriber({ apiKey: KEY, timeoutMs, fetch: doFetch })

const signal = () => new AbortController().signal

afterEach(() => {
    vi.useRealTimers()
})

describe('createGeminiTranscriber', () => {
    it('sends the clip inline to gemini-3.5-transcribe in smart mode', async () => {
        const calls: Call[] = []
        const transcribe = transcriberWith(fakeFetch(() => Response.json(completed('ok')), calls))
        await transcribe({ bytes: BYTES, mimeType: 'audio/webm;codecs=opus' }, signal())
        expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
        expect(calls[0]?.init?.method).toBe('POST')
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

    it('sends a Safari mp4 clip as audio/m4a, the name Gemini lists for that container', async () => {
        const calls: Call[] = []
        const transcribe = transcriberWith(fakeFetch(() => Response.json(completed('ok')), calls))
        await transcribe({ bytes: BYTES, mimeType: 'audio/mp4;codecs=mp4a.40.2' }, signal())
        const body = JSON.parse(String(calls[0]?.init?.body))
        expect(body.input[0].mime_type).toBe('audio/m4a')
    })

    it('returns the trimmed transcript joined from the text parts', async () => {
        const transcribe = transcriberWith(
            fakeFetch(() => Response.json(completed(' Amanhã tenho Hyrox.', ' Long run? ')))
        )
        expect(await transcribe({ bytes: BYTES, mimeType: 'audio/webm' }, signal())).toEqual({
            ok: true,
            text: 'Amanhã tenho Hyrox. Long run?',
        })
    })

    it('returns an empty text when there is no transcript', async () => {
        const transcribe = transcriberWith(
            fakeFetch(() => Response.json({ id: 'x', status: 'completed', steps: [] }))
        )
        expect(await transcribe({ bytes: BYTES, mimeType: 'audio/webm' }, signal())).toEqual({
            ok: true,
            text: '',
        })
    })

    it('returns rate_limited on a 429', async () => {
        const transcribe = transcriberWith(fakeFetch(() => Response.json({}, { status: 429 })))
        expect(await transcribe({ bytes: BYTES, mimeType: 'audio/webm' }, signal())).toEqual({
            ok: false,
            kind: 'rate_limited',
            reason: '429',
        })
    })

    it.each([
        ['a 500', () => Response.json({}, { status: 500 }), '500'],
        ['a 400', () => Response.json({}, { status: 400 }), '400'],
        ['a malformed body', () => new Response('not json'), 'parse'],
        ['an unexpected shape', () => Response.json({ outputs: [] }), 'parse'],
        [
            'a failed interaction',
            () => Response.json({ ...completed('x'), status: 'failed' }),
            'failed',
        ],
        [
            'an incomplete interaction',
            () => Response.json({ ...completed('x'), status: 'incomplete' }),
            'incomplete',
        ],
        [
            'a rejected fetch',
            () => {
                throw new TypeError('network')
            },
            'network',
        ],
    ])('returns unavailable on %s with its reason', async (_label, respond, reason) => {
        const transcribe = transcriberWith(fakeFetch(respond))
        expect(await transcribe({ bytes: BYTES, mimeType: 'audio/webm' }, signal())).toEqual({
            ok: false,
            kind: 'unavailable',
            reason,
        })
    })

    it('aborts the request and returns unavailable after the timeout', async () => {
        vi.useFakeTimers()
        let received: AbortSignal | undefined
        const hanging = vi.fn<typeof fetch>(
            (_input, init) =>
                new Promise((_resolve, reject) => {
                    received = init?.signal ?? undefined
                    received?.addEventListener('abort', () => reject(new Error('aborted')))
                })
        )
        const pending = transcriberWith(hanging, 1000)(
            { bytes: BYTES, mimeType: 'audio/webm' },
            signal()
        )
        await vi.advanceTimersByTimeAsync(1000)
        expect(received?.aborted).toBe(true)
        expect(await pending).toEqual({ ok: false, kind: 'unavailable', reason: 'timeout' })
    })

    it('aborts the request when the caller signal aborts', async () => {
        const calls: Call[] = []
        const controller = new AbortController()
        const transcribe = transcriberWith(fakeFetch(() => Response.json(completed('x')), calls))
        await transcribe({ bytes: BYTES, mimeType: 'audio/webm' }, controller.signal)
        controller.abort()
        expect(calls[0]?.init?.signal?.aborted).toBe(true)
    })
})
