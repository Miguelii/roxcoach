import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { deleteAccount } from '@/_bff/modules/athlete/services/delete-account.service'

export const DELETE_ACCOUNT_PROTECTED_CONTROLLER = protectedProcedure.mutation(({ ctx }) =>
    runEffect(deleteAccount(ctx.user), 'deleteAccount', (error) =>
        Match.value(error).pipe(
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('AccountDeletionError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
