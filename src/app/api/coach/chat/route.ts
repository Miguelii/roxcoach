import { Cause, Effect, Exit } from 'effect'
import { ServerEnv } from '@/env/server'
import { Logger } from '@/_bff/lib/server-logger'
import { getSession } from '@/_bff/modules/auth/services/get-session.service'
import { COACH_MODELS } from '@/_bff/core/constants/coach-models.constants'
import { FALLBACK_DEADLINE_MS } from '@/_bff/modules/coach/constants'
import { buildCoachModels } from '@/_bff/modules/coach/helpers/build-coach-models.helper'
import { createChatHandler } from '@/_bff/modules/coach/helpers/chat-handler.helper'
import { sendCoachMessage } from '@/_bff/modules/coach/services/send-coach-message.service'

// The proxy matcher excludes `api/`, so this route authenticates itself, like the upload route.
// The Gemini key is read here only; helpers receive the built model.
export const maxDuration = 60

const apiKey = ServerEnv.NEXT_GEMINI_API_KEY
const model = apiKey
    ? buildCoachModels({
          apiKey,
          deadlineMs: FALLBACK_DEADLINE_MS,
          modelIds: COACH_MODELS.map(({ id }) => id),
          log: ({ modelId, kind }) =>
              Logger({ level: 'warn', prefix: 'coachModelFallback', metadata: { modelId, kind } }),
      })
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
