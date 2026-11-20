import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect, Exit } from 'effect'
import { localDayBoundsUtc, todayIn } from '@/_bff/core/utils/date.utils'
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
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
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
import {
    countUserMessagesBetween,
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

// Everything the service reads or writes, so tests pass fakes. The real ports share one Supabase
// client created before streaming: the assistant message is saved while the response streams,
// when the request cookies may no longer be readable.
export type CoachPorts = {
    getTimezone: (user: User) => Ported<string>
    findConversation: (user: User, id: string) => Ported<ConversationDTO | null>
    createConversation: (user: User, title: string) => Ported<ConversationDTO>
    saveMessage: (user: User, input: MessageInput) => Ported<MessageDTO>
    latestMessages: (user: User, conversationId: string, limit: number) => Ported<MessageDTO[]>
    touch: (user: User, conversationId: string) => Ported<boolean>
    countToday: (user: User, timezone: string, now: Date) => Ported<number>
    getContext: (user: User) => Ported<{ context: string; timezone: string }>
    makeTools: (user: User) => CoachTool[]
}

type Input = { conversationId: string | null; message: string }

type Deps = { model: CoachModel; now?: Date; signal: AbortSignal; ports?: CoachPorts }

const makeRealPorts = (supabase: CoachClient): CoachPorts => ({
    getTimezone: (user) => getAthleteTimezone(user),
    findConversation: (user, id) => selectConversation(supabase, user.id, id),
    createConversation: (user, title) => insertConversation(supabase, user.id, title),
    saveMessage: (user, input) => insertMessage(supabase, user.id, input),
    latestMessages: (user, conversationId, limit) =>
        selectLatestMessages(supabase, user.id, conversationId, limit),
    touch: (user, conversationId) => touchConversation(supabase, user.id, conversationId),
    countToday: (user, timezone, now) => {
        const { fromIso, toIso } = localDayBoundsUtc(todayIn(timezone, now), timezone)
        return countUserMessagesBetween(supabase, user.id, fromIso, toIso)
    },
    getContext: (user) => getCoachContext(user),
    makeTools: (user) => makeCoachTools(user),
})

// An invalid stored timezone must not turn the cap into a defect: it counts in UTC instead.
const safeTimezone = (timezone: string): string => {
    try {
        // Throws a RangeError for an unknown timezone.
        Intl.DateTimeFormat('en-US', { timeZone: timezone })
        return timezone
    } catch {
        return 'UTC'
    }
}

const logTag = (tag: string, errorHash?: string) =>
    Logger({ level: 'error', prefix: 'coachChat', metadata: { tag, error_hash: errorHash } })

// Saves the finished reply and bumps the conversation. A failure is logged (tag only): the
// athlete already saw the whole reply, so the stream still ends with `done`.
const saveReply = async (
    user: User,
    conversationId: string,
    model: CoachModel,
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
                model: model.modelId,
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
    try {
        for await (const event of model.stream(request)) {
            if (request.signal.aborted) return
            if (event.type === 'text') {
                text += event.delta
                yield event
            } else if (event.type === 'error') {
                yield event
                return
            } else {
                if (text.length > 0)
                    await saveReply(user, conversationId, model, text, event.usage, ports)
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
// stream. Order: ownership of the conversation, the daily cap, the new conversation, the user
// message (saved on arrival, so cancelled and failed attempts count toward the cap), the context.
export const sendCoachMessage = Effect.fn('sendCoachMessage')(function* (
    user: User,
    input: Input,
    deps: Deps
) {
    const ports = deps.ports ?? makeRealPorts(yield* createCoachClient())
    const now = deps.now ?? new Date()

    let existingId: string | null = null
    if (input.conversationId !== null) {
        const found = yield* ports.findConversation(user, input.conversationId)
        if (found === null)
            return yield* new ConversationNotFoundError({
                cause: 'Conversation not found',
                error_hash: ErrorCode.COACH_CONVERSATION_NOT_FOUND,
            })
        existingId = found.id
    }

    const timezone = safeTimezone(yield* ports.getTimezone(user))
    const sentToday = yield* ports.countToday(user, timezone, now)
    if (sentToday >= DAILY_MESSAGE_CAP)
        return yield* new DailyCapReachedError({
            cause: 'Daily message cap reached',
            error_hash: ErrorCode.COACH_DAILY_CAP_REACHED,
        })

    const id =
        existingId ??
        (yield* ports.createConversation(user, input.message.slice(0, TITLE_MAX_CHARS))).id

    yield* ports.saveMessage(user, { conversationId: id, role: 'user', content: input.message })

    const { context } = yield* ports.getContext(user)
    const messages = buildHistory(yield* ports.latestMessages(user, id, HISTORY_WINDOW))

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
