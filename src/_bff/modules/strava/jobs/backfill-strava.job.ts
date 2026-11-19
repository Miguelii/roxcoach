import { task } from '@trigger.dev/sdk'
import { Effect } from 'effect'
import {
    BACKFILL_RECENT_WINDOW_S,
    BACKFILL_WINDOW_S,
    BULK_JOB_MAX_ATTEMPTS,
    STRAVA_JOB_IDS,
} from '@/_bff/modules/strava/constants'
import { runStravaJob, stravaCatchError } from '@/_bff/modules/strava/helpers/strava-job.helper'
import { syncMissingActivities } from '@/_bff/modules/strava/services/sync-missing-activities.service'

type Payload = { userId: string }

// First connect. Strava lists activities oldest first, so a single 12 month pass would sync the
// recent weeks that drive the dashboard last. The run therefore does two passes: the last 35 days
// first (without stamping `last_synced_at`), then the full 12 months (the stored-activity skip
// makes the overlap cheap). A rate limit stops the run and Trigger retries it after the wait
// (up to BULK_JOB_MAX_ATTEMPTS attempts); everything already stored is skipped, so each attempt
// continues where the previous one stopped.
export const backfillStravaJob = task({
    id: STRAVA_JOB_IDS.backfill,
    maxDuration: 3600,
    retry: {
        maxAttempts: BULK_JOB_MAX_ATTEMPTS,
        factor: 2,
        minTimeoutInMs: 5000,
        maxTimeoutInMs: 300_000,
        randomize: true,
    },
    catchError: stravaCatchError,
    run: (payload: Payload) =>
        runStravaJob(
            Effect.gen(function* () {
                const nowS = Math.floor(Date.now() / 1000)
                yield* syncMissingActivities(payload.userId, {
                    afterEpochS: nowS - BACKFILL_RECENT_WINDOW_S,
                    markSynced: false,
                })
                return yield* syncMissingActivities(payload.userId, {
                    afterEpochS: nowS - BACKFILL_WINDOW_S,
                })
            })
        ),
})
