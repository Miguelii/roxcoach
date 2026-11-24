import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    idList,
    runCoachRead,
    runCoachWrite,
    type Codes,
    type CoachClient,
} from '@/_bff/modules/coach/repositories/coach-query'
import type { ConversationDTO } from '@/_bff/modules/coach/types'
import { selectColumns } from '@/_bff/core/db/columns'
import { DbTables } from '@/_bff/core/db/tables'

type ConversationRow = z.infer<typeof conversationRowSchema>

const COLUMNS = selectColumns(DbTables.COACH_CONVERSATIONS, ['id', 'title', 'updated_at'])
const TITLE_MAX_CHARS = 60

// Cuts by code points, so an emoji (a surrogate pair) is never split.
const cutTitle = (title: string): string => Array.from(title).slice(0, TITLE_MAX_CHARS).join('')

const conversationRowSchema = z.object({
    id: z.string(),
    title: z.string().nullable(),
    updated_at: z.string(),
})

const LIST_CODES: Codes = {
    call: ErrorCode.COACH_CONVERSATIONS_SELECT,
    returned: ErrorCode.COACH_CONVERSATIONS_SELECT_ERR,
    parse: ErrorCode.COACH_CONVERSATIONS_SELECT_PARSE,
}
const SELECT_CODES: Codes = {
    call: ErrorCode.COACH_CONVERSATION_SELECT,
    returned: ErrorCode.COACH_CONVERSATION_SELECT_ERR,
    parse: ErrorCode.COACH_CONVERSATION_SELECT_PARSE,
}
const INSERT_CODES: Codes = {
    call: ErrorCode.COACH_CONVERSATION_INSERT,
    returned: ErrorCode.COACH_CONVERSATION_INSERT_ERR,
    parse: ErrorCode.COACH_CONVERSATION_INSERT_PARSE,
}
const TOUCH_CODES: Codes = {
    call: ErrorCode.COACH_CONVERSATION_TOUCH,
    returned: ErrorCode.COACH_CONVERSATION_TOUCH_ERR,
    parse: ErrorCode.COACH_CONVERSATION_TOUCH_PARSE,
}
const DELETE_CODES: Codes = {
    call: ErrorCode.COACH_CONVERSATION_DELETE,
    returned: ErrorCode.COACH_CONVERSATION_DELETE_ERR,
    parse: ErrorCode.COACH_CONVERSATION_DELETE_PARSE,
}

const toDTO = (row: ConversationRow): ConversationDTO => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
})

const maybeRow = z.preprocess((value) => value ?? null, conversationRowSchema.nullable())
const rowList = z.preprocess((value) => value ?? [], z.array(conversationRowSchema))

// Newest first. Every query carries the user_id filter.
export const selectConversations = Effect.fn('selectConversations')(function* (
    supabase: CoachClient,
    userId: string,
    limit: number
) {
    const rows = yield* runCoachRead(
        () =>
            supabase
                .from(DbTables.COACH_CONVERSATIONS)
                .select(COLUMNS)
                .eq('user_id', userId)
                .order('updated_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(limit),
        LIST_CODES,
        rowList
    )
    return rows.map((row) => toDTO(row))
})

// Null when no conversation with this id belongs to the user.
export const selectConversation = Effect.fn('selectConversation')(function* (
    supabase: CoachClient,
    userId: string,
    id: string
) {
    const row = yield* runCoachRead(
        () =>
            supabase
                .from(DbTables.COACH_CONVERSATIONS)
                .select(COLUMNS)
                .eq('id', id)
                .eq('user_id', userId)
                .maybeSingle(),
        SELECT_CODES,
        maybeRow
    )
    return row === null ? null : toDTO(row)
})

// The caller supplies a title already cut to 60 code points; the cap is enforced again here.
export const insertConversation = Effect.fn('insertConversation')(function* (
    supabase: CoachClient,
    userId: string,
    title: string
) {
    const row = yield* runCoachWrite(
        () =>
            supabase
                .from(DbTables.COACH_CONVERSATIONS)
                .insert({ user_id: userId, title: cutTitle(title) })
                .select(COLUMNS)
                .single(),
        INSERT_CODES,
        conversationRowSchema
    )
    return toDTO(row)
})

// Bumps updated_at (set explicitly; the set_updated_at trigger also sets it on every update).
// True when a conversation of this user was updated.
export const touchConversation = Effect.fn('touchConversation')(function* (
    supabase: CoachClient,
    userId: string,
    id: string
) {
    const updated = yield* runCoachWrite(
        () =>
            supabase
                .from(DbTables.COACH_CONVERSATIONS)
                .update({ updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', userId)
                .select(selectColumns(DbTables.COACH_CONVERSATIONS, ['id'])),
        TOUCH_CODES,
        idList
    )
    return updated.length > 0
})

// Hard delete, messages cascade. True when a row was deleted.
export const deleteConversationById = Effect.fn('deleteConversationById')(function* (
    supabase: CoachClient,
    userId: string,
    id: string
) {
    const deleted = yield* runCoachWrite(
        () =>
            supabase
                .from(DbTables.COACH_CONVERSATIONS)
                .delete()
                .eq('id', id)
                .eq('user_id', userId)
                .select(selectColumns(DbTables.COACH_CONVERSATIONS, ['id'])),
        DELETE_CODES,
        idList
    )
    return deleted.length > 0
})
