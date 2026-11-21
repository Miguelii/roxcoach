import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { Logger } from '@/_bff/lib/server-logger'
import {
    deleteAuthUser,
    removeAllActivityFiles,
} from '@/_bff/modules/athlete/repositories/account-data.repository'

type AdminClient = ReturnType<typeof createDBAdminClient>
type ServerClient = Awaited<ReturnType<typeof createDBServerClient>>

export type DeleteAccountDeps = {
    createAdminClient: () => AdminClient
    createServerClient: () => Promise<ServerClient>
}

const defaultDeps = (): DeleteAccountDeps => ({
    createAdminClient: createDBAdminClient,
    createServerClient: () => createDBServerClient(),
})

/**
 * Deletes the signed-in user and everything they own. The storage files go first (storage objects
 * are not removed by a cascade), so a failure leaves the data in place and the user can retry. Then
 * the auth user is deleted and every table cascades from it. Finally the local session is cleared.
 * @param user - The signed-in user (from `protectedProcedure`).
 * @param deps - Client factories (defaults use the real clients).
 */
export const deleteAccount = Effect.fn('deleteAccount')(function* (
    user: User,
    deps: DeleteAccountDeps = defaultDeps()
) {
    const admin = yield* Effect.try({
        try: () => deps.createAdminClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.ATHLETE_DELETE_SB_CLIENT }),
    })

    yield* removeAllActivityFiles(admin, user.id)
    yield* deleteAuthUser(admin, user.id)

    // Best effort: the user is gone, so a leftover cookie session is already invalid. A failed
    // sign-out is logged, never returned as a failure.
    const { error } = yield* Effect.tryPromise({
        try: async () => (await deps.createServerClient()).auth.signOut({ scope: 'local' }),
        catch: (cause) => cause,
    }).pipe(Effect.catch((cause) => Effect.succeed({ error: cause })))

    if (error)
        Logger({
            level: 'error',
            prefix: 'deleteAccount.signOut',
            error,
            userId: user.id,
            metadata: { error_hash: ErrorCode.ATHLETE_DELETE_SIGN_OUT },
        })

    return { status: 200 as const }
})
