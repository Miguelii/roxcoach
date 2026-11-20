import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { listRaces } from '@/_bff/modules/races/services/list-races.service'

const LIST_INPUT = z.object({
    status: z.array(z.enum(['upcoming', 'completed', 'cancelled'])).optional(),
})

export const LIST_RACES_PROTECTED_CONTROLLER = protectedProcedure
    .input(LIST_INPUT)
    .query(({ ctx, input }) =>
        runEffect(listRaces(ctx.user, input), 'listRaces', (error) =>
            Match.value(error).pipe(
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('RaceQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
