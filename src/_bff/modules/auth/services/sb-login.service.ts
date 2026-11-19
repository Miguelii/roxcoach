import 'server-only'

import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'
import { AccessDeniedError, CreateSbClientError, SignInWithPasswordError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { Logger } from '@/_bff/lib/server-logger'

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
    // signed in. The local scope removes the cookie session even when the server revoke fails.
    // A failed cleanup is logged (thrown or returned error) but the access error is what matters.
    if (!hasRoxcoachAccess(data.user)) {
        const { error: signOutError } = yield* Effect.tryPromise({
            try: () => supabase.auth.signOut({ scope: 'local' }),
            catch: (cause) => cause,
        }).pipe(Effect.catch((cause) => Effect.succeed({ error: cause })))

        if (signOutError)
            Logger({ level: 'error', prefix: 'sbLogin.cleanupSignOut', error: signOutError })

        return yield* new AccessDeniedError({
            cause: 'missing app_metadata.roxcoach flag',
            error_hash: ErrorCode.AUTH_LOGIN_NO_ACCESS,
        })
    }

    return { status: 200 as const }
})
