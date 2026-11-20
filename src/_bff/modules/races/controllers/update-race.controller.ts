import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { RACE_INPUT } from '@/_bff/modules/races/controllers/race-input.schema'
import { updateRace } from '@/_bff/modules/races/services/update-race.service'

export const UPDATE_RACE_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ id: z.uuid(), race: RACE_INPUT }))
    .mutation(({ ctx, input }) =>
        runEffect(updateRace(ctx.user, input.id, input.race), 'updateRace', (error) =>
            Match.value(error).pipe(
                Match.tag('RaceValidationError', () => 'BAD_REQUEST' as const),
                Match.tag('RaceNotFoundError', () => 'NOT_FOUND' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('RaceQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
