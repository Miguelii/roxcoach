import { Match } from 'effect'
import { protectedProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { getProfile } from '@/_bff/modules/athlete/services/get-profile.service'

export const GET_PROFILE_PROTECTED_CONTROLLER = protectedProcedure.query(({ ctx }) =>
    runEffect(getProfile(ctx.user), 'getProfile', (error) =>
        Match.value(error).pipe(
            Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.tag('ProfileQueryError', () => 'INTERNAL_SERVER_ERROR' as const),
            Match.exhaustive
        )
    )
)
