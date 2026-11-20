import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ConversationNotFoundError } from '@/_bff/lib/errors'
import { MESSAGES_RETURNED } from '@/_bff/modules/coach/constants'
import { selectConversation } from '@/_bff/modules/coach/repositories/coach-conversations.repository'
import { selectLatestMessages } from '@/_bff/modules/coach/repositories/coach-messages.repository'
import { createCoachClient } from '@/_bff/modules/coach/services/coach-client.service'

// The latest messages of one conversation, oldest first. Another athlete's id and an id that does
// not exist fail the same way.
export const getConversationMessages = Effect.fn('getConversationMessages')(function* (
    user: User,
    conversationId: string
) {
    const supabase = yield* createCoachClient()
    const conversation = yield* selectConversation(supabase, user.id, conversationId)
    if (conversation === null)
        return yield* new ConversationNotFoundError({
            cause: 'Conversation not found',
            error_hash: ErrorCode.COACH_CONVERSATION_NOT_FOUND,
        })
    return yield* selectLatestMessages(supabase, user.id, conversationId, MESSAGES_RETURNED)
})
