import { Cause, Effect, Exit } from 'effect'
import { ServerEnv } from '@/env/server'
import { Logger } from '@/_bff/lib/server-logger'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import { createTranscribeTokenHandler } from '@/_bff/modules/coach/helpers/transcribe-token-handler.helper'
import { createLiveTokenIssuer } from '@/_bff/modules/coach/providers/gemini-live-token'

// The proxy matcher excludes `api/`, so this route authenticates itself, like the chat route.
// The Gemini key is read here only; the handler receives the built issuer.
const apiKey = ServerEnv.NEXT_GEMINI_API_KEY
const issueToken = apiKey ? createLiveTokenIssuer({ apiKey }) : null

const handler = createTranscribeTokenHandler({
    isConfigured: issueToken !== null,
    getUser: async () => {
        const exit = await Effect.runPromiseExit(getSession())
        if (Exit.isSuccess(exit)) return exit.value
        const failure = exit.cause.reasons.find(Cause.isFailReason)
        Logger({
            level: 'error',
            prefix: 'coachTranscribeTokenSession',
            metadata: {
                tag: failure?.error._tag ?? 'Defect',
                error_hash: failure?.error.error_hash,
            },
        })
        throw new Error('Session lookup failed')
    },
    issueToken: () =>
        issueToken === null
            ? Promise.resolve({ ok: false, kind: 'unavailable', reason: 'not_configured' })
            : issueToken(),
})

export const POST = (request: Request) => handler(request)
