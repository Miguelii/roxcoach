import 'server-only'

import { router } from '@/_bff/trpc/server'
import { LIST_CONVERSATIONS_PROTECTED_CONTROLLER } from '@/_bff/modules/coach/controllers/list-conversations.controller'
import { GET_CONVERSATION_MESSAGES_PROTECTED_CONTROLLER } from '@/_bff/modules/coach/controllers/get-conversation-messages.controller'
import { DELETE_CONVERSATION_PROTECTED_CONTROLLER } from '@/_bff/modules/coach/controllers/delete-conversation.controller'

export const COACH_ROUTER = router({
    listConversations: LIST_CONVERSATIONS_PROTECTED_CONTROLLER,
    getConversationMessages: GET_CONVERSATION_MESSAGES_PROTECTED_CONTROLLER,
    deleteConversation: DELETE_CONVERSATION_PROTECTED_CONTROLLER,
})
