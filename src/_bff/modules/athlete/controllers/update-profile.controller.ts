import { Match } from 'effect'
import { z } from 'zod'
import { HYROX_DIVISION_KEYS } from '@/_bff/core/constants/hyrox.constants'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { updateProfile } from '@/_bff/modules/athlete/services/update-profile.service'

// Same ranges as validateProfile (which also checks the timezone and resting < max).
const PROFILE_INPUT = z.object({
    displayName: z.string().trim().min(1).max(60),
    timezone: z.string().min(1),
    maxHr: z.number().int().min(120).max(230).nullable(),
    restingHr: z.number().int().min(30).max(120).nullable(),
    hyroxDivision: z.enum(HYROX_DIVISION_KEYS).nullable(),
    weeklyHoursCap: z.number().gt(0).max(40).nullable(),
    notes: z.string().max(1000).nullable(),
})

export const UPDATE_PROFILE_PROTECTED_CONTROLLER = protectedProcedure
    .input(PROFILE_INPUT)
    .mutation(({ ctx, input }) =>
        runEffect(updateProfile(ctx.user, input), 'updateProfile', (error) =>
            Match.value(error).pipe(
                Match.tag('ProfileValidationError', () => 'BAD_REQUEST' as const),
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
                Match.exhaustive
            )
        )
    )
