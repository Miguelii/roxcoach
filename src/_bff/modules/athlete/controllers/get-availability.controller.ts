import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getAvailability } from '@/_bff/modules/athlete/services/get-availability.service'

export const GET_AVAILABILITY_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(getAvailability(ctx.user), 'getAvailability', (error) =>
        Match.value(error).pipe(
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('AvailabilityQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
