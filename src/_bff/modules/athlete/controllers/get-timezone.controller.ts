import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'

export const GET_TIMEZONE_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(getAthleteTimezone(ctx.user), 'getTimezone', (error) =>
        Match.value(error).pipe(
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
