import { Match } from 'effect'
import { z } from 'zod'
import { publicProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { sbLogin } from '@/_bff/modules/auth/services/sb-login.service'

export const SB_LOGIN_PUBLIC_CONTROLLER = publicProcedure
    .input(z.object({ email: z.email(), password: z.string().min(1) }))
    .mutation(({ input }) =>
        runEffect(sbLogin(input.email, input.password), 'sbLogin', (error) =>
            Match.value(error).pipe(
                Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                // Both map to UNAUTHORIZED so the client cannot tell a wrong password from an
                // account without roxcoach access
                Match.tag('SignInWithPasswordError', () => 'UNAUTHORIZED' as const),
                Match.tag('AccessDeniedError', () => 'UNAUTHORIZED' as const),
                Match.exhaustive
            )
        )
    )
