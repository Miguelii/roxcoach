import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { completeRace } from '@/_bff/modules/races/services/complete-race.service'

export const COMPLETE_RACE_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ id: z.uuid(), resultTimeS: z.number().int().min(1).max(86400) }))
    .mutation(({ ctx, input }) =>
        runEffect(completeRace(ctx.user, input.id, input.resultTimeS), 'completeRace', (error) =>
            Match.value(error).pipe(
                Match.tag('RaceValidationError', () => 'BAD_REQUEST' as const),
                Match.tag('RaceNotFoundError', () => 'NOT_FOUND' as const),
                Match.tag('RaceStateError', () => 'CONFLICT' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('RaceQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
