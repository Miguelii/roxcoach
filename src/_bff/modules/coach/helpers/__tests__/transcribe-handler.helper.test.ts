// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import type { User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { AUDIO_MAX_BYTES } from '@/_bff/modules/coach/constants'
import { createTranscribeHandler } from '@/_bff/modules/coach/helpers/transcribe-handler.helper'
import type { TranscribeOutcome, Transcriber } from '@/_bff/modules/coach/providers/transcriber'

type SetupOptions = {
    user?: User | null
    getUserThrows?: boolean
    isConfigured?: boolean
    outcome?: TranscribeOutcome | Error
}

const makeUser = (id: string, appMetadata: User['app_metadata']): User => ({
    id,
    app_metadata: appMetadata,
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
})

const ACCESS_USER = makeUser('user-1', { roxcoach: true })
const NO_FLAG_USER = makeUser('user-2', { roxcoach: 'true' })

const GENERIC = 'Something went wrong. Try again.'
const TOO_LONG = 'The recording is too long'

const setup = ({
    user = ACCESS_USER,
    getUserThrows = false,
    isConfigured = true,
    outcome = { ok: true, text: 'hello coach' },
}: SetupOptions = {}) => {
    const transcribe = vi.fn<Transcriber>(async () => {
        if (outcome instanceof Error) throw outcome
        return outcome
    })
    const handler = createTranscribeHandler({
        getUser: async () => {
            if (getUserThrows) throw new Error('session down')
            return user
        },
        isConfigured,
        transcribe,
    })
    return { transcribe, handler }
}

const clip = (type = 'audio/webm;codecs=opus', size = 3) =>
    new File([new Uint8Array(size).fill(7)], 'voice', { type })

// Browsers always send content-length for FormData; a Request built here does not, so it is set.
const DEFAULT_HEADERS = { 'content-length': '1000' }

const request = (fields: Record<string, string | File>, headers = DEFAULT_HEADERS) => {
    const body = new FormData()
    for (const [key, value] of Object.entries(fields)) body.set(key, value)
    return new Request('http://localhost/api/coach/transcribe', { method: 'POST', body, headers })
}

const expectError = async (response: Response, status: number, error: string) => {
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
}

describe('createTranscribeHandler', () => {
    it('returns 500 when the session lookup throws', async () => {
        const { handler, transcribe } = setup({ getUserThrows: true })
        await expectError(await handler(request({ audio: clip() })), 500, GENERIC)
        expect(transcribe).not.toHaveBeenCalled()
    })

    it('returns 401 without a user', async () => {
        const { handler, transcribe } = setup({ user: null })
        await expectError(
            await handler(request({ audio: clip() })),
            401,
            'Sign in to use voice input'
        )
        expect(transcribe).not.toHaveBeenCalled()
    })

    it('returns 403 without the strict access flag', async () => {
        const { handler, transcribe } = setup({ user: NO_FLAG_USER })
        await expectError(await handler(request({ audio: clip() })), 403, 'You do not have access')
        expect(transcribe).not.toHaveBeenCalled()
    })

    it('returns 503 when the key is not configured', async () => {
        const { handler, transcribe } = setup({ isConfigured: false })
        await expectError(
            await handler(request({ audio: clip() })),
            503,
            'Voice input is not available right now'
        )
        expect(transcribe).not.toHaveBeenCalled()
    })

    it.each([
        ['missing', { 'content-length': '' }],
        ['over the cap', { 'content-length': String(AUDIO_MAX_BYTES + 64 * 1024 + 1) }],
        ['not a number', { 'content-length': 'abc' }],
    ])('returns 413 when content-length is %s', async (_label, headers) => {
        const { handler, transcribe } = setup()
        await expectError(await handler(request({ audio: clip() }, headers)), 413, TOO_LONG)
        expect(transcribe).not.toHaveBeenCalled()
    })

    it.each([
        ['no audio field', {}],
        ['a plain string', { audio: 'text' }],
        ['an empty file', { audio: clip('audio/webm', 0) }],
    ])('returns 422 for %s', async (_label, fields) => {
        const { handler, transcribe } = setup()
        await expectError(await handler(request(fields)), 422, 'Record something first')
        expect(transcribe).not.toHaveBeenCalled()
    })

    it('returns 413 when the file is over 2 MB', async () => {
        const { handler, transcribe } = setup()
        const big = clip('audio/webm', AUDIO_MAX_BYTES + 1)
        await expectError(await handler(request({ audio: big })), 413, TOO_LONG)
        expect(transcribe).not.toHaveBeenCalled()
    })

    it.each(['audio/flac', 'video/webm', ''])('returns 415 for the type "%s"', async (type) => {
        const { handler, transcribe } = setup()
        await expectError(
            await handler(request({ audio: clip(type) })),
            415,
            'This recording format is not supported'
        )
        expect(transcribe).not.toHaveBeenCalled()
    })

    it.each(['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg'])(
        'transcribes a %s clip with its bytes and type as sent',
        async (type) => {
            const { handler, transcribe } = setup()
            const response = await handler(request({ audio: clip(type) }))
            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({ text: 'hello coach' })
            expect(transcribe).toHaveBeenCalledTimes(1)
            expect(transcribe).toHaveBeenCalledWith(
                { bytes: new Uint8Array([7, 7, 7]), mimeType: type },
                expect.any(AbortSignal)
            )
        }
    )

    it('passes the request signal to the transcriber', async () => {
        const { handler, transcribe } = setup()
        const controller = new AbortController()
        const body = new FormData()
        body.set('audio', clip())
        await handler(
            new Request('http://localhost/api/coach/transcribe', {
                method: 'POST',
                body,
                headers: { 'content-length': '1000' },
                signal: controller.signal,
            })
        )
        const signal = transcribe.mock.calls[0]?.[1]
        expect(signal?.aborted).toBe(false)
        controller.abort()
        expect(signal?.aborted).toBe(true)
    })

    it('returns 429 when the model is rate limited', async () => {
        const { handler } = setup({ outcome: { ok: false, kind: 'rate_limited', reason: '429' } })
        await expectError(
            await handler(request({ audio: clip() })),
            429,
            'Transcription is busy. Try again in a minute.'
        )
    })

    it('returns 502 when the model is unavailable', async () => {
        const { handler } = setup({ outcome: { ok: false, kind: 'unavailable', reason: '500' } })
        await expectError(
            await handler(request({ audio: clip() })),
            502,
            "Couldn't transcribe. Try again."
        )
    })

    it('returns 500 when the transcriber throws', async () => {
        const { handler } = setup({ outcome: new Error('boom') })
        await expectError(await handler(request({ audio: clip() })), 500, GENERIC)
    })
})
