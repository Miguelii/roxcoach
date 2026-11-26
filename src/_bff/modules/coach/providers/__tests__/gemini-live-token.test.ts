// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { liveTokenRequestBody } from '@/_bff/core/constants/transcribe-live.constants'
import { createLiveTokenIssuer } from '@/_bff/modules/coach/providers/gemini-live-token'

type Call = { url: string; init: RequestInit | undefined }

const KEY = 'test-key-abc123'
const NOW = new Date('2026-11-26T10:00:00.000Z')

const fakeFetch = (respond: () => Response, calls: Call[] = []) =>
    vi.fn<typeof fetch>(async (input, init) => {
        calls.push({ url: String(input), init })
        return respond()
    })

const TIMEOUT_MS = 5000

const issuerWith = (doFetch: typeof fetch) =>
    createLiveTokenIssuer({ apiKey: KEY, timeoutMs: TIMEOUT_MS, fetch: doFetch, now: () => NOW })

afterEach(() => {
    vi.useRealTimers()
})

describe('createLiveTokenIssuer', () => {
    it('posts the shared one-use token request with the key header', async () => {
        const calls: Call[] = []
        await issuerWith(fakeFetch(() => Response.json({ name: 'auth_tokens/t1' }), calls))()
        expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens')
        expect(calls[0]?.init?.method).toBe('POST')
        expect(new Headers(calls[0]?.init?.headers).get('x-goog-api-key')).toBe(KEY)
        expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(liveTokenRequestBody(NOW))
    })

    it('returns the token from the name field', async () => {
        const issue = issuerWith(fakeFetch(() => Response.json({ name: 'auth_tokens/t1' })))
        expect(await issue()).toEqual({ ok: true, token: 'auth_tokens/t1' })
    })

    it('returns rate_limited on a 429', async () => {
        const issue = issuerWith(fakeFetch(() => Response.json({}, { status: 429 })))
        expect(await issue()).toEqual({ ok: false, kind: 'rate_limited', reason: '429' })
    })

    it('returns unavailable with a timeout reason when Google does not answer in time', async () => {
        vi.useFakeTimers()
        const hanging = vi.fn<typeof fetch>(
            (_input, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
                })
        )
        const outcome = issuerWith(hanging)()
        await vi.advanceTimersByTimeAsync(TIMEOUT_MS)
        expect(await outcome).toEqual({ ok: false, kind: 'unavailable', reason: 'timeout' })
    })

    it.each([
        ['a 400', () => Response.json({}, { status: 400 }), '400'],
        ['a missing name', () => Response.json({ token: 'x' }), 'parse'],
        ['a body that is not JSON', () => new Response('nope'), 'parse'],
        [
            'a rejected fetch',
            () => {
                throw new TypeError('network')
            },
            'network',
        ],
    ])('returns unavailable on %s with its reason', async (_label, respond, reason) => {
        const issue = issuerWith(fakeFetch(respond))
        expect(await issue()).toEqual({ ok: false, kind: 'unavailable', reason })
    })
})
