import 'server-only'

import { Effect } from 'effect'
import type { ActivityRow, LapRow } from '@/_bff/modules/strava/helpers/map-strava-activity.helper'
import { upsertStravaActivity } from '@/_bff/modules/training/repositories/activities.repository'
import { replaceLaps } from '@/_bff/modules/training/repositories/activity-laps.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'

// Called by the sync with the service-role client. Returns the activity id.
export const upsertActivityFromStrava = Effect.fn('upsertActivityFromStrava')(function* (
    supabase: TrainingClient,
    userId: string,
    row: ActivityRow,
    laps: LapRow[]
) {
    const activityId = yield* upsertStravaActivity(supabase, userId, row)
    yield* replaceLaps(supabase, userId, activityId, laps)
    return activityId
})
