import 'server-only'

import { Effect } from 'effect'
import { softDeleteByStravaId } from '@/_bff/modules/training/repositories/activities.repository'
import type { TrainingClient } from '@/_bff/modules/training/types'

// Called by the webhook delete event with the service-role client.
export const softDeleteStravaActivity = Effect.fn('softDeleteStravaActivity')(function* (
    supabase: TrainingClient,
    userId: string,
    stravaId: number
) {
    yield* softDeleteByStravaId(supabase, userId, stravaId)
})
