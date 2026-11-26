import { z } from 'zod'
import { liveTokenRequestBody } from '@/_bff/core/constants/transcribe-live.constants'

export type LiveTokenOutcome =
    | { ok: true; token: string }
    // `reason` is for logs only, never shown.
    | { ok: false; kind: 'rate_limited' | 'unavailable'; reason: string }

type Options = { apiKey: string; fetch?: typeof fetch; now?: () => Date }

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens'

// The Live API docs' SDK reads the ephemeral token from `name`.
const TokenSchema = z.object({ name: z.string().min(1) })

const unavailable = (reason: string): LiveTokenOutcome => ({
    ok: false,
    kind: 'unavailable',
    reason,
})

export const createLiveTokenIssuer =
    ({ apiKey, fetch: doFetch = fetch, now = () => new Date() }: Options) =>
    async (): Promise<LiveTokenOutcome> => {
        try {
            const response = await doFetch(ENDPOINT, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify(liveTokenRequestBody(now())),
            })
            if (response.status === 429) return { ok: false, kind: 'rate_limited', reason: '429' }
            if (!response.ok) return unavailable(String(response.status))
            const parsed = TokenSchema.safeParse(await response.json().catch(() => null))
            return parsed.success ? { ok: true, token: parsed.data.name } : unavailable('parse')
        } catch {
            return unavailable('network')
        }
    }
