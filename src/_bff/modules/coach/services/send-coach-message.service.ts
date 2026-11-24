import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect, Exit } from 'effect'
import { todayIn, validTimezoneOrUtc } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    ConversationNotFoundError,
    DailyCapReachedError,
    type ActivityQueryError,
    type AvailabilityQueryError,
    type CoachQueryError,
    type CoachWriteError,
    type CreateSbClientError,
    type InvalidDateRangeError,
    type ProfileQueryError,
    type RaceQueryError,
} from '@/_bff/lib/errors'
import { Logger } from '@/_bff/lib/server-logger'
import { getProfile } from '@/_bff/modules/athlete/services/get-profile.service'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import {
    DAILY_MESSAGE_CAP,
    HISTORY_WINDOW,
    MAX_STEPS,
    TITLE_MAX_CHARS,
} from '@/_bff/modules/coach/constants'
import { buildHistory } from '@/_bff/modules/coach/helpers/build-history.helper'
import { buildCoachSystemPrompt } from '@/_bff/modules/coach/helpers/coach-system-prompt.helper'
import type { CoachModel } from '@/_bff/modules/coach/providers/coach-model'
import {
    insertConversation,
    selectConversation,
    touchConversation,
} from '@/_bff/modules/coach/repositories/coach-conversations.repository'
import { takeMessageSlot } from '@/_bff/modules/coach/repositories/coach-usage.repository'
import {
    insertMessage,
    selectLatestMessages,
} from '@/_bff/modules/coach/repositories/coach-messages.repository'
import type { CoachClient } from '@/_bff/modules/coach/repositories/coach-query'
import { createCoachClient } from '@/_bff/modules/coach/services/coach-client.service'
import { getCoachContext } from '@/_bff/modules/coach/services/get-coach-context.service'
import { makeCoachTools } from '@/_bff/modules/coach/tools/coach-tools'
import type {
    CoachTool,
    ConversationDTO,
    MessageDTO,
    MessageInput,
} from '@/_bff/modules/coach/types'

// The wire events of the chat stream. A daily cap is a 429 before the stream, not an event.
export type ChatEvent =
    | { type: 'meta'; conversationId: string }
    | { type: 'model'; model: string; switchedFrom: string | null }
    | { type: 'text'; delta: string }
    | { type: 'done' }
    | { type: 'error'; kind: 'rate_limited' | 'unavailable' | 'blocked' }

type PortError =
    | CreateSbClientError
    | CoachQueryError
    | CoachWriteError
    | InvalidDateRangeError
    | ProfileQueryError
    | AvailabilityQueryError
    | RaceQueryError
    | ActivityQueryError

type Ported<T> = Effect.Effect<T, PortError>

// Everything the service reads or writes, so tests pass fakes. The save, touch and slot ports
// share one Supabase client created before streaming: the assistant message is saved while the
// response streams, when the request cookies may no longer be readable. The context and the tools
// create their own session-bound clients.
export type CoachPorts = {
    getProfile: (user: User) => Ported<ProfileDTO>
    findConversation: (user: User, id: string) => Ported<ConversationDTO | null>
    createConversation: (user: User, title: string) => Ported<ConversationDTO>
    saveMessage: (user: User, input: MessageInput) => Ported<MessageDTO>
    latestMessages: (user: User, conversationId: string, limit: number) => Ported<MessageDTO[]>
    touch: (user: User, conversationId: string) => Ported<boolean>
    // Atomically takes one slot of the athlete's local `day` (YYYY-MM-DD). False: the cap is reached.
    takeMessageSlot: (user: User, day: string, cap: number) => Ported<boolean>
    getContext: (
        user: User,
        base: { profile: ProfileDTO; timezone: string; today: string }
    ) => Ported<{ context: string; timezone: string }>
    makeTools: (user: User) => CoachTool[]
}

type Input = { conversationId: string | null; message: string }

type Deps = { model: CoachModel; now?: Date; signal: AbortSignal; ports?: CoachPorts }

const makeRealPorts = (supabase: CoachClient): CoachPorts => ({
    getProfile: (user) => getProfile(user),
    findConversation: (user, id) => selectConversation(supabase, user.id, id),
    createConversation: (user, title) => insertConversation(supabase, user.id, title),
    saveMessage: (user, input) => insertMessage(supabase, user.id, input),
    latestMessages: (user, conversationId, limit) =>
        selectLatestMessages(supabase, user.id, conversationId, limit),
    touch: (user, conversationId) => touchConversation(supabase, user.id, conversationId),
    takeMessageSlot: (_user, day, cap) => takeMessageSlot(supabase, day, cap),
    getContext: (user, base) => getCoachContext(user, base),
    makeTools: (user) => makeCoachTools(user),
})

const logTag = (tag: string, errorHash?: string) =>
    Logger({ level: 'error', prefix: 'coachChat', metadata: { tag, error_hash: errorHash } })

// Saves the finished reply and bumps the conversation. A failure is logged (tag only): the
// athlete already saw the whole reply, so the stream still ends with `done`.
const saveReply = async (
    user: User,
    conversationId: string,
    answeredBy: string,
    text: string,
    usage: { promptTokens: number | null; completionTokens: number | null },
    ports: CoachPorts
) => {
    const saved = await Effect.runPromiseExit(
        ports
            .saveMessage(user, {
                conversationId,
                role: 'assistant',
                content: text,
                model: answeredBy,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
            })
            .pipe(Effect.andThen(ports.touch(user, conversationId)))
    )
    if (Exit.isFailure(saved)) logTag('AssistantSaveFailure')
}

// Streams the model events as wire events. The assistant message is saved only on a `done` of a
// request that was not aborted and produced text.
async function* streamReply(
    user: User,
    conversationId: string,
    model: CoachModel,
    request: Parameters<CoachModel['stream']>[0],
    ports: CoachPorts
): AsyncGenerator<ChatEvent> {
    yield { type: 'meta', conversationId }
    let text = ''
    // The model that produced the reply: the last `model` event, else the provider's own id.
    let answeredBy = model.modelId
    try {
        for await (const event of model.stream(request)) {
            if (request.signal.aborted) return
            if (event.type === 'text') {
                text += event.delta
                yield event
            } else if (event.type === 'error') {
                yield event
                return
            } else if (event.type === 'model') {
                answeredBy = event.modelId
                yield { type: 'model', model: event.modelId, switchedFrom: event.switchedFrom }
            } else {
                if (text.length > 0)
                    await saveReply(user, conversationId, answeredBy, text, event.usage, ports)
                yield { type: 'done' }
                return
            }
        }
    } catch {
        if (request.signal.aborted) return
        logTag('ModelStreamDefect')
        yield { type: 'error', kind: 'unavailable' }
        return
    }
    if (!request.signal.aborted) yield { type: 'error', kind: 'unavailable' }
}

// Does every check and write that must happen before the response starts, then returns the event
// stream. The profile and the conversation are read together, then the daily cap (one atomic slot
// per athlete-local day, so a cancelled or failed attempt still counts and deleting a conversation
// never gives it back), the context and the history run together. Nothing is written before the cap
// is taken: the new conversation and the user message come last.
export const sendCoachMessage = Effect.fn('sendCoachMessage')(function* (
    user: User,
    input: Input,
    deps: Deps
) {
    const ports = deps.ports ?? makeRealPorts(yield* createCoachClient())
    const now = deps.now ?? new Date()

    const [found, profile] = yield* Effect.all(
        [
            input.conversationId === null
                ? Effect.succeed(null)
                : ports.findConversation(user, input.conversationId),
            ports.getProfile(user),
        ],
        { concurrency: 'unbounded' }
    )
    if (input.conversationId !== null && found === null)
        return yield* new ConversationNotFoundError({
            cause: 'Conversation not found',
            error_hash: ErrorCode.COACH_CONVERSATION_NOT_FOUND,
        })

    const timezone = validTimezoneOrUtc(profile.timezone)
    const today = todayIn(timezone, now)

    const [slotTaken, { context }, previous] = yield* Effect.all(
        [
            ports.takeMessageSlot(user, today, DAILY_MESSAGE_CAP),
            ports.getContext(user, { profile, timezone, today }),
            found === null
                ? Effect.succeed([])
                : ports.latestMessages(user, found.id, HISTORY_WINDOW - 1),
        ],
        { concurrency: 'unbounded' }
    )
    if (!slotTaken)
        return yield* new DailyCapReachedError({
            cause: 'Daily message cap reached',
            error_hash: ErrorCode.COACH_DAILY_CAP_REACHED,
        })

    const id =
        found?.id ??
        (yield* ports.createConversation(
            user,
            Array.from(input.message).slice(0, TITLE_MAX_CHARS).join('')
        )).id

    const saved = yield* ports.saveMessage(user, {
        conversationId: id,
        role: 'user',
        content: input.message,
    })
    const messages = buildHistory([...previous, saved])

    return streamReply(
        user,
        id,
        deps.model,
        {
            system: buildCoachSystemPrompt(context),
            messages,
            tools: ports.makeTools(user),
            maxSteps: MAX_STEPS,
            signal: deps.signal,
        },
        ports
    )
})
