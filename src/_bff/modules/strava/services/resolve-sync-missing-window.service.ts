import 'server-only'

import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { BACKFILL_WINDOW_S } from '@/_bff/modules/strava/constants'
import { selectConnection } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import { createSyncClient } from '@/_bff/modules/strava/services/sync-strava-activity.service'

// Epoch seconds from which a manual sync lists activities: the connection's last successful sync.
// A connection that never synced (or a missing one) falls back to the backfill window.
export const resolveSyncMissingWindow = Effect.fn('resolveSyncMissingWindow')(function* (
    userId: string
) {
    const supabase = yield* createSyncClient(ErrorCode.STRAVA_JOB_WINDOW_SB_CLIENT)
    const connection = yield* selectConnection(supabase, userId)

    const lastSynced = connection?.last_synced_at ?? null
    const lastSyncedMs = lastSynced === null ? Number.NaN : Date.parse(lastSynced)
    return Number.isNaN(lastSyncedMs)
        ? Math.floor(Date.now() / 1000) - BACKFILL_WINDOW_S
        : Math.floor(lastSyncedMs / 1000)
})
