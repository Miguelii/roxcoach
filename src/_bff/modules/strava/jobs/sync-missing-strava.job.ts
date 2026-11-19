import { task } from '@trigger.dev/sdk'
import { Effect } from 'effect'
import { STRAVA_JOB_IDS } from '@/_bff/modules/strava/constants'
import { runStravaJob, stravaCatchError } from '@/_bff/modules/strava/helpers/strava-job.helper'
import { resolveSyncMissingWindow } from '@/_bff/modules/strava/services/resolve-sync-missing-window.service'
import { syncMissingActivities } from '@/_bff/modules/strava/services/sync-missing-activities.service'

type Payload = { userId: string }

// The "Sync now" recovery path: lists the activities since the last successful sync and syncs the
// ones a missed webhook left out.
export const syncMissingStravaJob = task({
    id: STRAVA_JOB_IDS.syncMissing,
    maxDuration: 3600,
    retry: {
        maxAttempts: 4,
        factor: 2,
        minTimeoutInMs: 5000,
        maxTimeoutInMs: 300_000,
        randomize: true,
    },
    catchError: stravaCatchError,
    run: (payload: Payload) =>
        runStravaJob(
            resolveSyncMissingWindow(payload.userId).pipe(
                Effect.flatMap((afterEpochS) =>
                    syncMissingActivities(payload.userId, { afterEpochS })
                )
            )
        ),
})
