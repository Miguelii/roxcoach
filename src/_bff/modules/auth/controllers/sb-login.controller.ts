import { Match } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { publicProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { sbLogin } from '@/_bff/modules/auth/services/sb-login.service'

export const SB_LOGIN_PUBLIC_CONTROLLER = publicProcedure
    .input(z.object({ email: z.email(), password: z.string().min(1) }))
    .mutation(({ input }) =>
        runEffect(
            sbLogin(input.email, input.password),
            'sbLogin',
            (error) =>
                Match.value(error).pipe(
                    Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                    // Both map to UNAUTHORIZED so the client cannot tell a wrong password from an
                    // account without roxcoach access
                    Match.tag('SignInWithPasswordError', () => 'UNAUTHORIZED' as const),
                    Match.tag('AccessDeniedError', () => 'UNAUTHORIZED' as const),
                    Match.exhaustive
                ),
            // Logs keep the distinct hashes. The client gets one constant message for both auth
            // failures so a wrong password and an unflagged account are indistinguishable.
            (error) =>
                Match.value(error).pipe(
                    Match.tag('CreateSbClientError', (e) => e.error_hash),
                    Match.tag('SignInWithPasswordError', () => ErrorCode.AUTH_LOGIN_SIGN_IN_ERR),
                    Match.tag('AccessDeniedError', () => ErrorCode.AUTH_LOGIN_SIGN_IN_ERR),
                    Match.exhaustive
                )
        )
    )
