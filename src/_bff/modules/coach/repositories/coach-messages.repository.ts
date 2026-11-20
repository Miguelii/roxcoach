import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
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

const toDTO = (row: MessageRow): MessageDTO => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
})

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
