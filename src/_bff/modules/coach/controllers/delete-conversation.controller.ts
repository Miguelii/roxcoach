import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { deleteConversation } from '@/_bff/modules/coach/services/delete-conversation.service'

export const DELETE_CONVERSATION_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ conversationId: z.uuid() }))
    .mutation(({ ctx, input }) =>
        runEffect(
            deleteConversation(ctx.user, input.conversationId),
            'deleteConversation',
            (error) =>
                Match.value(error).pipe(
                    Match.tag('ConversationNotFoundError', () => 'NOT_FOUND' as const),
                    Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                    Match.tag('CoachWriteError', () => 'INTERNAL_SERVER_ERROR' as const),
                    Match.exhaustive
                )
        )
    )
