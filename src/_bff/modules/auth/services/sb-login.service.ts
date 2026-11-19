import 'server-only'

import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'
import { AccessDeniedError, CreateSbClientError, SignInWithPasswordError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

export const sbLogin = Effect.fn('sbLogin')(function* (email: string, password: string) {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.AUTH_LOGIN_SB_CLIENT }),
    })

    const { data, error } = yield* Effect.tryPromise({
        try: () => supabase.auth.signInWithPassword({ email, password }),
        catch: (cause) =>
            new SignInWithPasswordError({ cause, error_hash: ErrorCode.AUTH_LOGIN_SIGN_IN }),
    })

    if (error)
        return yield* new SignInWithPasswordError({
            cause: error,
            error_hash: ErrorCode.AUTH_LOGIN_SIGN_IN_ERR,
        })

    // The project is shared with another app: a valid account without the flag must not stay
    // signed in. A failed cleanup sign-out is ignored, the access error is what matters.
    if (!hasRoxcoachAccess(data.user)) {
        yield* Effect.tryPromise(() => supabase.auth.signOut()).pipe(Effect.ignore)

        return yield* new AccessDeniedError({
            cause: 'missing app_metadata.roxcoach flag',
            error_hash: ErrorCode.AUTH_LOGIN_NO_ACCESS,
        })
    }

    return { status: 200 as const }
})
