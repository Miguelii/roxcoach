import 'server-only'

import { Effect } from 'effect'
import type { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { GrantAccessError } from '@/_bff/lib/errors'

type AdminClient = ReturnType<typeof createDBAdminClient>

/**
 * Calls `roxcoach.grant_access`: sets the access flag and creates the athlete profile in one
 * transaction. This is the grant itself, so unlike other repositories it does not filter by
 * `user_id`; it takes the service-role client and the id of the user to grant.
 * @param supabase - The service-role client (the function is executable by the service role only).
 * @param userId - The user to grant access to.
 * @param displayName - The name shown in the app.
 */
export const grantAccess = Effect.fn('grantAccess')(function* (
    supabase: AdminClient,
    userId: string,
    displayName: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.rpc('grant_access', { p_user_id: userId, p_display_name: displayName }),
        catch: (cause) =>
            new GrantAccessError({ cause: String(cause), error_hash: ErrorCode.AUTH_SIGNUP_GRANT }),
    })

    if (error)
        return yield* new GrantAccessError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.AUTH_SIGNUP_GRANT_ERR,
        })
})
