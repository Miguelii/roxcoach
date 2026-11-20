import 'server-only'

import type { User } from '@supabase/supabase-js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Cause, Effect, Exit, Match } from 'effect'
import { z } from 'zod'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'
import { Logger } from '@/_bff/lib/server-logger'
import { MESSAGE_MAX_CHARS } from '@/_bff/modules/coach/constants'
import type {
    ChatEvent,
    sendCoachMessage,
} from '@/_bff/modules/coach/services/send-coach-message.service'

type SendInput = { conversationId: string | null; message: string }

// The typed failures of the service, so a renamed tag fails compilation in the mapping below.
type SendFailure = Effect.Error<ReturnType<typeof sendCoachMessage>>

type ChatHandlerDeps = {
    getUser: () => Promise<User | null>
    // False when the Gemini key is not configured: the handler answers 503.
    isConfigured: boolean
    send: (
        user: User,
        input: SendInput,
        signal: AbortSignal
    ) => Effect.Effect<AsyncIterable<ChatEvent>, SendFailure>
}

const MAX_BODY_BYTES = 16 * 1024
const GENERIC = 'Something went wrong. Try again.'
const BAD_MESSAGE = `Write a message of up to ${MESSAGE_MAX_CHARS} characters`

const BodySchema = z.object({ conversationId: z.uuid().nullable(), message: z.string() })

const fail = (status: number, error: string) => Response.json({ error }, { status })

// Reads the body, never more than MAX_BODY_BYTES. Null when it is larger.
const readCapped = async (request: Request): Promise<string | null> => {
    const reader = request.body?.getReader()
    if (!reader) return ''
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_BODY_BYTES) {
            await reader.cancel().catch(() => undefined)
            return null
        }
        chunks.push(value)
    }
    return new TextDecoder().decode(Buffer.concat(chunks))
}

const encoder = new TextEncoder()
const line = (event: ChatEvent) => encoder.encode(`${JSON.stringify(event)}\n`)

// Turns the events into an NDJSON body. Cancelling the body (the client went away) aborts the
// controller, which the model request carries as its signal. Next pipes the body outside the
// request scope (cookies() would throw there), so every step re-enters it through `inRequest`,
// an AsyncLocalStorage snapshot taken while the handler still ran inside the request.
const toStream = (
    events: AsyncIterable<ChatEvent>,
    controller: AbortController,
    inRequest: <T>(run: () => T) => T
) => {
    const iterator = events[Symbol.asyncIterator]()
    let cancelled = false
    return new ReadableStream<Uint8Array>({
        async pull(out) {
            try {
                const next = await inRequest(() => iterator.next())
                if (cancelled) return
                if (next.done) out.close()
                else out.enqueue(line(next.value))
            } catch {
                if (cancelled) return
                Logger({ level: 'error', prefix: 'coachChat', metadata: { tag: 'StreamDefect' } })
                out.enqueue(line({ type: 'error', kind: 'unavailable' }))
                out.close()
            }
        },
        async cancel() {
            cancelled = true
            controller.abort()
            await inRequest(() => iterator.return?.())
        },
    })
}

// Builds the POST handler (the route file only wires the real session, service and model in).
// Error bodies are fixed strings: the message, the model output, the context and the key never
// appear in a response or a log.
export const createChatHandler =
    ({ getUser, isConfigured, send }: ChatHandlerDeps) =>
    async (request: Request): Promise<Response> => {
        let user: User | null
        try {
            user = await getUser()
        } catch {
            Logger({ level: 'error', prefix: 'coachChat', metadata: { tag: 'SessionFailure' } })
            return fail(500, GENERIC)
        }
        if (!user) return fail(401, 'Sign in to chat')
        if (!hasRoxcoachAccess(user)) return fail(403, 'You do not have access')
        if (!isConfigured) return fail(503, 'The coach is not available right now')

        const header = request.headers.get('content-length')
        if (header !== null && Number(header) > MAX_BODY_BYTES) return fail(413, BAD_MESSAGE)

        const raw = await readCapped(request).catch(() => null)
        if (raw === null) return fail(422, BAD_MESSAGE)
        let json: unknown
        try {
            json = JSON.parse(raw)
        } catch {
            return fail(422, BAD_MESSAGE)
        }
        const parsed = BodySchema.safeParse(json)
        if (!parsed.success) return fail(422, BAD_MESSAGE)
        const message = parsed.data.message.trim()
        if (message.length === 0 || message.length > MESSAGE_MAX_CHARS)
            return fail(422, BAD_MESSAGE)

        // The request signal and a cancel of the response body both stop the model.
        const controller = new AbortController()
        if (request.signal.aborted) controller.abort()
        else request.signal.addEventListener('abort', () => controller.abort(), { once: true })

        const inRequest = AsyncLocalStorage.snapshot()
        const exit = await Effect.runPromiseExit(
            send(user, { conversationId: parsed.data.conversationId, message }, controller.signal)
        )
        if (Exit.isSuccess(exit)) {
            return new Response(toStream(exit.value, controller, inRequest), {
                headers: {
                    'Content-Type': 'application/x-ndjson; charset=utf-8',
                    'Cache-Control': 'no-store',
                },
            })
        }

        const failure = exit.cause.reasons.find(Cause.isFailReason)
        const mapped = failure
            ? Match.value(failure.error).pipe(
                  Match.tag('ConversationNotFoundError', () => fail(404, 'Conversation not found')),
                  Match.tag('DailyCapReachedError', () =>
                      fail(429, "You reached today's message limit")
                  ),
                  Match.orElse(() => null)
              )
            : null
        if (mapped) return mapped
        Logger({
            level: 'error',
            prefix: 'coachChat',
            userId: user.id,
            metadata: {
                tag: failure?.error._tag ?? 'Defect',
                error_hash: failure?.error.error_hash,
            },
        })
        return fail(500, GENERIC)
    }
