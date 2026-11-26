// @vitest-environment node
import type { User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createTranscribeTokenHandler } from '@/_bff/modules/coach/helpers/transcribe-token-handler.helper'
import type { LiveTokenOutcome } from '@/_bff/modules/coach/providers/gemini-live-token'

type SetupOptions = {
    user?: User | null
    getUserThrows?: boolean
    isConfigured?: boolean
    outcome?: LiveTokenOutcome | Error
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

const setup = ({
    user = ACCESS_USER,
    getUserThrows = false,
    isConfigured = true,
    outcome = { ok: true, token: 'auth_tokens/t1' },
}: SetupOptions = {}) => {
    const issueToken = vi.fn(async () => {
        if (outcome instanceof Error) throw outcome
        return outcome
    })
    const handler = createTranscribeTokenHandler({
        getUser: async () => {
            if (getUserThrows) throw new Error('session down')
            return user
        },
        isConfigured,
        issueToken,
    })
    return { issueToken, handler }
}

const request = () => new Request('http://localhost/api/coach/transcribe/token', { method: 'POST' })

describe('createTranscribeTokenHandler', () => {
    it.each([
        [
            'the session lookup throws',
            { getUserThrows: true },
            500,
            'Something went wrong. Try again.',
        ],
        ['there is no user', { user: null }, 401, 'Sign in to use voice input'],
        ['the access flag is not strict', { user: NO_FLAG_USER }, 403, 'You do not have access'],
        [
            'the key is not configured',
            { isConfigured: false },
            503,
            'Voice input is not available right now',
        ],
    ])('answers %s without issuing a token', async (_label, options, status, error) => {
        const { handler, issueToken } = setup(options)
        const response = await handler(request())
        expect(response.status).toBe(status)
        expect(await response.json()).toEqual({ error })
        expect(issueToken).not.toHaveBeenCalled()
    })

    it('returns the token without caching', async () => {
        const { handler } = setup()
        const response = await handler(request())
        expect(response.status).toBe(200)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(await response.json()).toEqual({ token: 'auth_tokens/t1' })
    })

    it.each([
        [
            { ok: false, kind: 'rate_limited', reason: '429' } as const,
            429,
            'Transcription is busy. Try again in a minute.',
        ],
        [
            { ok: false, kind: 'unavailable', reason: 'secret-reason-400' } as const,
            502,
            "Couldn't transcribe. Try again.",
        ],
    ])('maps a failed issue to %j', async (outcome, status, error) => {
        const { handler } = setup({ outcome })
        const response = await handler(request())
        expect(response.status).toBe(status)
        const body = await response.text()
        expect(JSON.parse(body)).toEqual({ error })
        expect(body).not.toContain(outcome.reason)
    })

    it('returns 500 when the issuer throws', async () => {
        const { handler } = setup({ outcome: new Error('boom') })
        const response = await handler(request())
        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({ error: 'Something went wrong. Try again.' })
    })
})
