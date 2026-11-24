import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { restoreRace } from '@/_bff/modules/races/services/update-race.service'

export const RESTORE_RACE_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
        runEffect(restoreRace(ctx.user, input.id), 'restoreRace', (error) =>
            Match.value(error).pipe(
                Match.tag('RaceNotFoundError', () => 'NOT_FOUND' as const),
                Match.tag('RaceStateError', () => 'CONFLICT' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('RaceQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
