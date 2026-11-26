import { Cause, Effect, Exit } from 'effect'
import { ServerEnv } from '@/env/server'
import { Logger } from '@/_bff/lib/server-logger'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import { TRANSCRIBE_TIMEOUT_MS } from '@/_bff/modules/coach/constants'
import { createTranscribeHandler } from '@/_bff/modules/coach/helpers/transcribe-handler.helper'
import { createGeminiTranscriber } from '@/_bff/modules/coach/providers/gemini-transcriber'

// The proxy matcher excludes `api/`, so this route authenticates itself, like the chat route.
// The Gemini key is read here only; the handler receives the built transcriber.
export const maxDuration = 60

const apiKey = ServerEnv.NEXT_GEMINI_API_KEY
const transcriber = apiKey
    ? createGeminiTranscriber({ apiKey, timeoutMs: TRANSCRIBE_TIMEOUT_MS })
    : null

const handler = createTranscribeHandler({
    isConfigured: transcriber !== null,
    getUser: async () => {
        const exit = await Effect.runPromiseExit(getSession())
        if (Exit.isSuccess(exit)) return exit.value
        const failure = exit.cause.reasons.find(Cause.isFailReason)
        Logger({
            level: 'error',
            prefix: 'coachTranscribeSession',
            metadata: {
                tag: failure?.error._tag ?? 'Defect',
                error_hash: failure?.error.error_hash,
            },
        })
        throw new Error('Session lookup failed')
    },
    transcribe: (input, signal) =>
        transcriber === null
            ? Promise.resolve({ ok: false, kind: 'unavailable', reason: 'not_configured' })
            : transcriber(input, signal),
})

export const POST = (request: Request) => handler(request)
