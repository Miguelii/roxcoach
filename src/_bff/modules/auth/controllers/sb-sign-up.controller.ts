import { Match } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { publicProcedure } from '@/_bff/trpc/server'
import { runEffect } from '@/_bff/trpc/utils'
import { sbSignUp } from '@/_bff/modules/auth/services/sb-sign-up.service'

// bcrypt ignores everything after 72 bytes.
const MAX_PASSWORD_LENGTH = 72

export const SB_SIGN_UP_PUBLIC_CONTROLLER = publicProcedure
    .input(
        z.object({
            email: z.email(),
            password: z.string().min(8).max(MAX_PASSWORD_LENGTH),
            accessCode: z.string().min(1),
        })
    )
    .mutation(({ input }) =>
        runEffect(
            sbSignUp(input),
            'sbSignUp',
            (error) =>
                Match.value(error).pipe(
                    Match.tag('CreateSbClientError', () => 'INTERNAL_SERVER_ERROR' as const),
                    // A closed sign-up, a bad code, a taken email and a failed grant must look the same.
                    Match.tag('SignUpClosedError', () => 'UNAUTHORIZED' as const),
                    Match.tag('InvalidAccessCodeError', () => 'UNAUTHORIZED' as const),
                    Match.tag('CreateUserError', () => 'UNAUTHORIZED' as const),
                    Match.tag('GrantAccessError', () => 'UNAUTHORIZED' as const),
                    Match.tag('SignInWithPasswordError', () => 'UNAUTHORIZED' as const),
                    Match.exhaustive
                ),
            // Logs keep the distinct hashes. The client gets one constant code for every refusal.
            (error) =>
                Match.value(error).pipe(
                    Match.tag('CreateSbClientError', (e) => e.error_hash),
                    Match.tag('SignUpClosedError', () => ErrorCode.AUTH_SIGNUP_FAILED),
                    Match.tag('InvalidAccessCodeError', () => ErrorCode.AUTH_SIGNUP_FAILED),
                    Match.tag('CreateUserError', () => ErrorCode.AUTH_SIGNUP_FAILED),
                    Match.tag('GrantAccessError', () => ErrorCode.AUTH_SIGNUP_FAILED),
                    Match.tag('SignInWithPasswordError', () => ErrorCode.AUTH_SIGNUP_FAILED),
                    Match.exhaustive
                )
        )
    )
