import 'server-only'

import type { User } from '@supabase/supabase-js'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'
import { Logger } from '@/_bff/lib/server-logger'
import type { LiveTokenOutcome } from '@/_bff/modules/coach/providers/gemini-live-token'

type TranscribeTokenHandlerDeps = {
    getUser: () => Promise<User | null>
    // False when the Gemini key is not configured: the handler answers 503.
    isConfigured: boolean
    issueToken: () => Promise<LiveTokenOutcome>
}

const GENERIC = 'Something went wrong. Try again.'

const fail = (status: number, error: string) => Response.json({ error }, { status })

// Builds the POST handler (the route file only wires the real session and issuer in). The token is
// only ever in the success body: never in a log or an error body.
export const createTranscribeTokenHandler =
    ({ getUser, isConfigured, issueToken }: TranscribeTokenHandlerDeps) =>
    async (_request: Request): Promise<Response> => {
        let user: User | null
        try {
            user = await getUser()
        } catch {
            Logger({
                level: 'error',
                prefix: 'coachTranscribeToken',
                metadata: { tag: 'SessionFailure' },
            })
            return fail(500, GENERIC)
        }
        if (!user) return fail(401, 'Sign in to use voice input')
        if (!hasRoxcoachAccess(user)) return fail(403, 'You do not have access')
        if (!isConfigured) return fail(503, 'Voice input is not available right now')

        try {
            const outcome = await issueToken()
            if (outcome.ok)
                return Response.json(
                    { token: outcome.token },
                    { headers: { 'Cache-Control': 'no-store' } }
                )
            Logger({
                level: 'warn',
                prefix: 'coachTranscribeToken',
                userId: user.id,
                metadata: { tag: outcome.kind, reason: outcome.reason },
            })
            return outcome.kind === 'rate_limited'
                ? fail(429, 'Transcription is busy. Try again in a minute.')
                : fail(502, "Couldn't transcribe. Try again.")
        } catch {
            Logger({
                level: 'error',
                prefix: 'coachTranscribeToken',
                userId: user.id,
                metadata: { tag: 'TokenDefect' },
            })
            return fail(500, GENERIC)
        }
    }
