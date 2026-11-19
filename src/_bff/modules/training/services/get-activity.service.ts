import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { selectActivityById } from '@/_bff/modules/training/repositories/activities.repository'
import { selectLaps } from '@/_bff/modules/training/repositories/activity-laps.repository'

// Runs as the signed-in user (publishable key). Returns null when the activity does not exist, is
// soft-deleted or belongs to someone else.
export const getActivity = Effect.fn('getActivity')(function* (user: User, id: string) {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
    })

    const activity = yield* selectActivityById(supabase, user.id, id)
    if (activity === null) return null

    const laps = yield* selectLaps(supabase, user.id, id)
    return { activity, laps }
})
