import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import {
    selectTimezone,
    type ProfilesClient,
} from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'

// For callers that already hold a client (the background task uses the service-role one).
export const getAthleteTimezoneWithClient = Effect.fn('getAthleteTimezoneWithClient')(function* (
    supabase: ProfilesClient,
    userId: string
) {
    return yield* selectTimezone(supabase, userId)
})

// Runs as the signed-in user (publishable key). Falls back to the column default without a profile.
export const getAthleteTimezone = Effect.fn('getAthleteTimezone')(function* (user: User) {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.ATHLETE_SB_CLIENT }),
    })

    return yield* getAthleteTimezoneWithClient(supabase, user.id)
})
