import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getActivity } from '@/_bff/modules/training/services/get-activity.service'

export const GET_ACTIVITY_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(({ ctx, input }) =>
        runEffect(getActivity(ctx.user, input.id), 'getActivity', (error) =>
            Match.value(error).pipe(
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
