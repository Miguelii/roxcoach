import { Match } from 'effect'
import { z } from 'zod'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getCalendar } from '@/_bff/modules/training/services/get-calendar.service'

// Plain calendar dates (YYYY-MM-DD, a real day), compared as text in SQL.
export const GET_CALENDAR_PROTECTED_CONTROLLER = protectedProcedure
    .input(z.object({ from: z.iso.date(), to: z.iso.date() }))
    .query(({ ctx, input }) =>
        runEffect(getCalendar(ctx.user, input), 'getCalendar', (error) =>
            Match.value(error).pipe(
                Match.tag('InvalidDateRangeError', () => 'BAD_REQUEST' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ActivityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
