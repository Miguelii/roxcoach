import { task } from '@trigger.dev/sdk'
import { BACKFILL_WINDOW_S, STRAVA_JOB_IDS } from '@/_bff/modules/strava/constants'
import { runStravaJob, stravaCatchError } from '@/_bff/modules/strava/helpers/strava-job.helper'
import { syncMissingActivities } from '@/_bff/modules/strava/services/sync-missing-activities.service'

type Payload = { userId: string }

// First connect: syncs the last 12 months. The service pages through the athlete's activities
// and waits between them, so a large history takes a long time. A rate limit stops the run and
// Trigger retries it later; activities already synced are upserted again, not duplicated.
export const backfillStravaJob = task({
    id: STRAVA_JOB_IDS.backfill,
    maxDuration: 3600,
    retry: {
        maxAttempts: 5,
        factor: 2,
        minTimeoutInMs: 5000,
        maxTimeoutInMs: 300_000,
        randomize: true,
    },
    catchError: stravaCatchError,
    run: (payload: Payload) =>
        runStravaJob(
            syncMissingActivities(payload.userId, {
                afterEpochS: Math.floor(Date.now() / 1000) - BACKFILL_WINDOW_S,
            })
        ),
})
