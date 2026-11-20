import { Match } from 'effect'
import { z } from 'zod'
import { SESSION_KINDS } from '@/_bff/core/constants/availability.constants'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { saveAvailability } from '@/_bff/modules/athlete/services/save-availability.service'

// Field ranges only; validateAvailability owns the cross-slot rules (duplicates, rest day, per day).
const SLOT_INPUT = z.object({
    weekday: z.number().int().min(1).max(7),
    sessionKind: z.enum(SESSION_KINDS),
    isFixed: z.boolean(),
    maxMinutes: z.number().int().min(15).max(360).nullable(),
    notes: z.string().max(200).nullable(),
})

// 7 weekdays times at most 4 slots each.
const SAVE_AVAILABILITY_INPUT = z.array(SLOT_INPUT).max(28)

export const SAVE_AVAILABILITY_PROTECTED_CONTROLLER = protectedProcedure
    .input(SAVE_AVAILABILITY_INPUT)
    .mutation(({ ctx, input }) =>
        runEffect(saveAvailability(ctx.user, input), 'saveAvailability', (error) =>
            Match.value(error).pipe(
                Match.tag('AvailabilityValidationError', () => 'BAD_REQUEST' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('AvailabilityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
