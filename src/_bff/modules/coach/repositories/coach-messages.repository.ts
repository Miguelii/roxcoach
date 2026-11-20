import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CoachQueryError } from '@/_bff/lib/errors'
import {
    runCoachRead,
    runCoachWrite,
    type Codes,
    type CoachClient,
} from '@/_bff/modules/coach/repositories/coach-query'
import type { MessageDTO, MessageInput } from '@/_bff/modules/coach/types'

type MessageRow = z.infer<typeof messageRowSchema>

const TABLE = 'coach_messages'
const COLUMNS = 'id, role, content, created_at'

const messageRowSchema = z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    created_at: z.string(),
})

const SELECT_CODES: Codes = {
    call: ErrorCode.COACH_MESSAGES_SELECT,
    returned: ErrorCode.COACH_MESSAGES_SELECT_ERR,
    parse: ErrorCode.COACH_MESSAGES_SELECT_PARSE,
}
const INSERT_CODES: Codes = {
    call: ErrorCode.COACH_MESSAGE_INSERT,
    returned: ErrorCode.COACH_MESSAGE_INSERT_ERR,
    parse: ErrorCode.COACH_MESSAGE_INSERT_PARSE,
}
const COUNT_CODES: Codes = {
    call: ErrorCode.COACH_MESSAGES_COUNT,
    returned: ErrorCode.COACH_MESSAGES_COUNT_ERR,
    parse: ErrorCode.COACH_MESSAGES_COUNT_PARSE,
}

const toDTO = (row: MessageRow): MessageDTO => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
})

const countSchema = z.number().int().nonnegative()

const rowList = z.preprocess((value) => value ?? [], z.array(messageRowSchema))

export const insertMessage = Effect.fn('insertMessage')(function* (
    supabase: CoachClient,
    userId: string,
    input: MessageInput
) {
    const row = yield* runCoachWrite(
        () =>
            supabase
                .from(TABLE)
                .insert({
                    user_id: userId,
                    conversation_id: input.conversationId,
                    role: input.role,
                    content: input.content,
                    model: input.model ?? null,
                    prompt_tokens: input.promptTokens ?? null,
                    completion_tokens: input.completionTokens ?? null,
                })
                .select(COLUMNS)
                .single(),
        INSERT_CODES,
        messageRowSchema
    )
    return toDTO(row)
})

// The newest `limit` messages of one conversation, returned oldest first. The conversation id is
// always combined with the user_id, so another athlete's id yields an empty list.
export const selectLatestMessages = Effect.fn('selectLatestMessages')(function* (
    supabase: CoachClient,
    userId: string,
    conversationId: string,
    limit: number
) {
    const rows = yield* runCoachRead(
        () =>
            supabase
                .from(TABLE)
                .select(COLUMNS)
                .eq('conversation_id', conversationId)
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(limit),
        SELECT_CODES,
        rowList
    )
    return rows.map(toDTO).reverse()
})

// Counts the user's own 'user' messages in the half-open interval [fromIso, toIso).
export const countUserMessagesBetween = Effect.fn('countUserMessagesBetween')(function* (
    supabase: CoachClient,
    userId: string,
    fromIso: string,
    toIso: string
) {
    const outcome = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('role', 'user')
                .gte('created_at', fromIso)
                .lt('created_at', toIso),
        catch: (cause) =>
            new CoachQueryError({ cause: String(cause), error_hash: COUNT_CODES.call }),
    })
    if (outcome.error)
        return yield* new CoachQueryError({
            cause: `${outcome.error.code}: ${outcome.error.message}`,
            error_hash: COUNT_CODES.returned,
        })
    const count = countSchema.safeParse(outcome.count)
    if (!count.success)
        return yield* new CoachQueryError({
            cause: 'Count missing from the response',
            error_hash: COUNT_CODES.parse,
        })
    return count.data
})
