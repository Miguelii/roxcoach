import 'server-only'

import { Effect } from 'effect'
import { selectExistingStravaIds } from '@/_bff/modules/training/repositories/activities.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'

// Called by the bulk Strava sync with the service-role client, to skip what is already stored.
export const getExistingStravaIds = Effect.fn('getExistingStravaIds')(function* (
    supabase: TrainingClient,
    userId: string,
    stravaIds: number[]
) {
    return yield* selectExistingStravaIds(supabase, userId, stravaIds)
})
