import 'server-only'

import { Effect } from 'effect'
import { countStravaActivities } from '@/_bff/modules/training/repositories/activities.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'

// Live (not soft-deleted) activities imported from Strava, for the Strava status in Settings.
export const getStravaActivityCount = Effect.fn('getStravaActivityCount')(function* (
    supabase: TrainingClient,
    userId: string
) {
    return yield* countStravaActivities(supabase, userId)
})
