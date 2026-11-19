import 'server-only'

import { Effect } from 'effect'
import { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { selectConnection } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { getStravaActivityCount } from '@/_bff/modules/training/services/get-strava-activity-count.service'

type StravaStatus = {
    connected: boolean
    athleteId: number | null
    connectedAt: string | null
    lastSyncedAt: string | null
    activityCount: number
}

// Built field by field from the row, so tokens and the scope string can never reach the client.
// strava_connections is service-role only, so both reads use the admin client, filtered by user.
export const getStravaStatus = Effect.fn('getStravaStatus')(function* (userId: string) {
    const supabase = yield* Effect.tryPromise({
        try: async () => createDBAdminClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.STRAVA_STATUS_SB_CLIENT }),
    })

    const connection = yield* selectConnection(supabase, userId)
    const activityCount = yield* getStravaActivityCount(supabase, userId)

    const status: StravaStatus = {
        connected: connection !== null,
        athleteId: connection?.strava_athlete_id ?? null,
        connectedAt: connection?.connected_at ?? null,
        lastSyncedAt: connection?.last_synced_at ?? null,
        activityCount,
    }
    return status
})
