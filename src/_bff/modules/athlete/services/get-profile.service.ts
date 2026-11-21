import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { selectProfile } from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'

// What the athlete sees before saving a profile for the first time.
const DEFAULT_PROFILE: ProfileDTO = {
    displayName: '',
    timezone: 'Europe/Lisbon',
    maxHr: null,
    restingHr: null,
    hyroxDivision: null,
    weeklyHoursCap: null,
    notes: null,
    dashboardMode: 'run',
}

// Runs as the signed-in user (publishable key). A missing row is not an error.
export const getProfile = Effect.fn('getProfile')(function* (user: User) {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.ATHLETE_SB_CLIENT }),
    })

    const profile = yield* selectProfile(supabase, user.id)
    return profile ?? DEFAULT_PROFILE
})
