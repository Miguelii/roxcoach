import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { listConversations } from '@/_bff/modules/coach/services/list-conversations.service'

export const LIST_CONVERSATIONS_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(listConversations(ctx.user), 'listConversations', (error) =>
        Match.value(error).pipe(
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('CoachQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
