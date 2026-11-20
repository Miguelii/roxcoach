import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getConversationMessages } from '@/_bff/modules/coach/services/get-conversation-messages.service'

export const GET_CONVERSATION_MESSAGES_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ conversationId: z.uuid() }))
    .query(({ ctx, input }) =>
        runEffect(
            getConversationMessages(ctx.user, input.conversationId),
            'getConversationMessages',
            (error) =>
                Match.value(error).pipe(
                    Match.tag('ConversationNotFoundError', () => 'NOT_FOUND' as const),
                    Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                    Match.tag('CoachQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                    Match.exhaustive
                )
        )
    )
