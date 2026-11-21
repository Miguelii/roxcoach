import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { updateDashboardMode } from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'

// Saves the dashboard mode and nothing else. Runs as the signed-in user (RLS applies).
export const setDashboardMode = Effect.fn('setDashboardMode')(function* (
    user: User,
    mode: DashboardMode
) {
    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.ATHLETE_SB_CLIENT }),
    })

    yield* updateDashboardMode(supabase, user.id, mode)
    return { status: 200 as const }
})
