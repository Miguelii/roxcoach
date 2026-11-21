import { Match } from 'effect'
import { z } from 'zod'
import { PROGRESS_RANGES } from '@/_bff/core/constants/progress.constants'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getRunProgress } from '@/_bff/modules/training/services/get-run-progress.service'

export const GET_RUN_PROGRESS_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ range: z.enum(PROGRESS_RANGES) }))
    .query(({ ctx, input }) =>
        runEffect(getRunProgress(ctx.user, input.range), 'getRunProgress', (error) =>
            Match.value(error).pipe(
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('RaceQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
