import { Match } from 'effect'
import { z } from 'zod'
import { PROGRESS_RANGES } from '@/_bff/core/constants/progress.constants'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getStrengthProgress } from '@/_bff/modules/training/services/get-strength-progress.service'

export const GET_STRENGTH_PROGRESS_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ range: z.enum(PROGRESS_RANGES) }))
    .query(({ ctx, input }) =>
        runEffect(getStrengthProgress(ctx.user, input.range), 'getStrengthProgress', (error) =>
            Match.value(error).pipe(
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),

                Match.exhaustive
            )
        )
    )
