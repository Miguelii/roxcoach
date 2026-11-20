import 'server-only'

import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'

// Runs as the signed-in user (publishable key), so RLS applies on top of the user_id filters.
export const createCoachClient = Effect.fn('createCoachClient')(function* () {
    return yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) => new CreateSbClientError({ cause, error_hash: ErrorCode.COACH_SB_CLIENT }),
    })
})
