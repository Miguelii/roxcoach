import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { selectSlots } from '@/_bff/modules/athlete/repositories/availability-slots.repository'

// Runs as the signed-in user (publishable key). No slots is a valid, empty week.
export const getAvailability = Effect.fn('getAvailability')(function* (user: User) {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({
                cause,
                error_hash: ErrorCode.ATHLETE_AVAILABILITY_SB_CLIENT,
            }),
    })

    return yield* selectSlots(supabase, user.id)
})
