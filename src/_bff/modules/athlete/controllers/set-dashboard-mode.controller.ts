import { Match } from 'effect'
import { z } from 'zod'
import { DASHBOARD_MODES } from '@/_bff/core/constants/athlete.constants'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { setDashboardMode } from '@/_bff/modules/athlete/services/set-dashboard-mode.service'

export const SET_DASHBOARD_MODE_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ mode: z.enum(DASHBOARD_MODES) }))
    .mutation(({ ctx, input }) =>
        runEffect(setDashboardMode(ctx.user, input.mode), 'setDashboardMode', (error) =>
            Match.value(error).pipe(
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
