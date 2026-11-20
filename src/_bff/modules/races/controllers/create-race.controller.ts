import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { RACE_INPUT } from '@/_bff/modules/races/controllers/race-input.schema'
import { createRace } from '@/_bff/modules/races/services/create-race.service'

export const CREATE_RACE_PROTECTED_CONTROLLER = protectedProcedure
    .input(RACE_INPUT)
    .mutation(({ ctx, input }) =>
        runEffect(createRace(ctx.user, input), 'createRace', (error) =>
            Match.value(error).pipe(
                Match.tag('RaceValidationError', () => 'BAD_REQUEST' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('RaceQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
