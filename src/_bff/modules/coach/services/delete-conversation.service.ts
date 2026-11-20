import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ConversationNotFoundError } from '@/_bff/lib/errors'
import { deleteConversationById } from '@/_bff/modules/coach/repositories/coach-conversations.repository'
import { createCoachClient } from '@/_bff/modules/coach/services/coach-client.service'

// Hard delete, the messages cascade. Another athlete's id is reported as not found.
export const deleteConversation = Effect.fn('deleteConversation')(function* (
    user: User,
    id: string
) {
    const supabase = yield* createCoachClient()
    const deleted = yield* deleteConversationById(supabase, user.id, id)
    if (!deleted)
        return yield* new ConversationNotFoundError({
            cause: 'Conversation not found',
            error_hash: ErrorCode.COACH_CONVERSATION_NOT_FOUND,
        })
    return { id }
})
