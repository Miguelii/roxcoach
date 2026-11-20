import { Cause, Effect, Exit } from 'effect'
import { ServerEnv } from '@/env/server'
import { Logger } from '@/_bff/lib/server-logger'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import { DEFAULT_COACH_MODEL } from '@/_bff/modules/coach/constants'
import { createChatHandler } from '@/_bff/modules/coach/helpers/chat-handler.helper'
import { createGeminiCoachModel } from '@/_bff/modules/coach/providers/gemini-coach-model'
import { sendCoachMessage } from '@/_bff/modules/coach/services/send-coach-message.service'

// The proxy matcher excludes `api/`, so this route authenticates itself, like the upload route.
// The Gemini key and model id are read here only; helpers receive the built model.
export const maxDuration = 60

const apiKey = ServerEnv.NEXT_GEMINI_API_KEY
const model = apiKey
    ? createGeminiCoachModel({ apiKey, modelId: ServerEnv.NEXT_COACH_MODEL ?? DEFAULT_COACH_MODEL })
    : null

const handler = createChatHandler({
    isConfigured: model !== null,
    getUser: async () => {
        const exit = await Effect.runPromiseExit(getSession())
        if (Exit.isSuccess(exit)) return exit.value
        const failure = exit.cause.reasons.find(Cause.isFailReason)
        Logger({
            level: 'error',
            prefix: 'coachChatSession',
            metadata: {
                tag: failure?.error._tag ?? 'Defect',
                error_hash: failure?.error.error_hash,
            },
        })
        throw new Error('Session lookup failed')
    },
    send: (user, input, signal) =>
        model === null
            ? Effect.die('Model not configured')
            : sendCoachMessage(user, input, { model, signal }),
})

export const POST = (request: Request) => handler(request)
