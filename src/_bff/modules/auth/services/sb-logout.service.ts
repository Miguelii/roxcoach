import 'server-only'

import { Effect } from 'effect'
import { revalidatePath } from 'next/cache'
import { createDBServerClient } from '@/_bff/core/db'
import { CreateSbClientError, LogoutError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

export const sbLogout = Effect.fn('sbLogout')(function* () {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.AUTH_LOGOUT_SB_CLIENT }),
    })

    const { error } = yield* Effect.tryPromise({
        // Local scope: the project is shared, so a global sign-out would revoke the refresh tokens
        // of the same account in the other app and on every other device.
        try: () => supabase.auth.signOut({ scope: 'local' }),
        catch: (cause) => new LogoutError({ cause, error_hash: ErrorCode.AUTH_LOGOUT_SIGN_OUT }),
    })

    if (error)
        return yield* new LogoutError({
            cause: error,
            error_hash: ErrorCode.AUTH_LOGOUT_SIGN_OUT,
        })

    revalidatePath('/', 'layout')

    return { status: 200 as const }
})
