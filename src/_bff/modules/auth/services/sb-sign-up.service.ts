import 'server-only'

import { Effect } from 'effect'
import { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    CreateSbClientError,
    CreateUserError,
    InvalidAccessCodeError,
    SignInWithPasswordError,
    SignUpClosedError,
} from '@/_bff/lib/errors'
import { Logger } from '@/_bff/lib/server-logger'
import { isValidAccessCode } from '@/_bff/modules/auth/helpers/access-code.helper'
import { grantAccess } from '@/_bff/modules/auth/repositories/access-grant.repository'
import { ServerEnv } from '@/env/server'

type AdminClient = ReturnType<typeof createDBAdminClient>
type ServerClient = Awaited<ReturnType<typeof createDBServerClient>>

type SignUpInput = { email: string; password: string; accessCode: string }

// Injectable so tests pass fakes instead of mocking modules.
export type SignUpDeps = {
    expectedCode: string | undefined
    createAdminClient: () => AdminClient
    createServerClient: () => Promise<ServerClient>
}

const MAX_DISPLAY_NAME_LENGTH = 60

const defaultDeps = (): SignUpDeps => ({
    expectedCode: ServerEnv.NEXT_SIGNUP_ACCESS_CODE,
    createAdminClient: createDBAdminClient,
    createServerClient: () => createDBServerClient(),
})

// The part of the email before the `@`, as the first name shown in the app.
const displayNameFor = (email: string): string =>
    email.split('@')[0].trim().slice(0, MAX_DISPLAY_NAME_LENGTH)

// Removes a user that was created but could not be granted access, so its email is not blocked.
// A failed cleanup is logged and never changes the result of the sign-up.
const deleteOrphan = Effect.fn('deleteOrphanUser')(function* (admin: AdminClient, userId: string) {
    const { error } = yield* Effect.tryPromise({
        try: () => admin.auth.admin.deleteUser(userId),
        catch: (cause) => cause,
    }).pipe(Effect.catch((cause) => Effect.succeed({ error: cause })))

    if (error)
        Logger({
            level: 'error',
            prefix: 'sbSignUp.cleanupDeleteUser',
            error,
            metadata: { userId, error_hash: ErrorCode.AUTH_SIGNUP_CLEANUP },
        })
})

/**
 * Creates a confirmed user after a correct access code, grants Roxcoach access with
 * `roxcoach.grant_access` and signs the user in. The code check runs first, so a bad code makes
 * no Supabase call.
 * @param input - Email, password and the access code the user typed.
 * @param deps - The expected code and client factories (defaults read the env and the real clients).
 */
export const sbSignUp = Effect.fn('sbSignUp')(function* (
    input: SignUpInput,
    deps: SignUpDeps = defaultDeps()
) {
    if (deps.expectedCode === undefined)
        return yield* new SignUpClosedError({
            cause: 'NEXT_SIGNUP_ACCESS_CODE is not set',
            error_hash: ErrorCode.AUTH_SIGNUP_CLOSED,
        })

    if (!isValidAccessCode(input.accessCode, deps.expectedCode))
        return yield* new InvalidAccessCodeError({
            cause: 'access code mismatch',
            error_hash: ErrorCode.AUTH_SIGNUP_BAD_CODE,
        })

    const admin = yield* Effect.try({
        try: () => deps.createAdminClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.AUTH_SIGNUP_SB_CLIENT }),
    })

    // No app_metadata here: the flag is written only by roxcoach.grant_access.
    const created = yield* Effect.tryPromise({
        try: () =>
            admin.auth.admin.createUser({
                email: input.email,
                password: input.password,
                email_confirm: true,
            }),
        catch: (cause) =>
            new CreateUserError({
                cause: String(cause),
                error_hash: ErrorCode.AUTH_SIGNUP_CREATE_USER,
            }),
    })

    if (created.error || !created.data.user)
        return yield* new CreateUserError({
            cause: created.error?.message ?? 'no user returned',
            error_hash: ErrorCode.AUTH_SIGNUP_CREATE_USER_ERR,
        })

    const userId = created.data.user.id

    yield* grantAccess(admin, userId, displayNameFor(input.email)).pipe(
        Effect.tapError(() => deleteOrphan(admin, userId))
    )

    // The grant is done, so the first token already carries the flag. A failure here keeps the user.
    const supabase = yield* Effect.tryPromise({
        try: () => deps.createServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.AUTH_SIGNUP_SB_CLIENT }),
    })

    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.auth.signInWithPassword({ email: input.email, password: input.password }),
        catch: (cause) =>
            new SignInWithPasswordError({ cause, error_hash: ErrorCode.AUTH_SIGNUP_SIGN_IN }),
    })

    if (error)
        return yield* new SignInWithPasswordError({
            cause: error.message,
            error_hash: ErrorCode.AUTH_SIGNUP_SIGN_IN,
        })

    return { status: 200 as const }
})
