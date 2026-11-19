import { task } from '@trigger.dev/sdk'
import { STRAVA_JOB_IDS } from '@/_bff/modules/strava/constants'
import {
    failureEventMessage,
    runStravaJob,
    stravaCatchError,
} from '@/_bff/modules/strava/helpers/strava-job.helper'
import {
    settleStravaActivityEvents,
    settleStravaEvent,
} from '@/_bff/modules/strava/services/settle-strava-event.service'
import { syncStravaActivity } from '@/_bff/modules/strava/services/sync-strava-activity.service'

type Payload = { userId: string; stravaActivityId: number; eventId: string | null }

// Payloads carry ids only, never tokens: the service loads the connection itself.
export const syncStravaActivityJob = task({
    id: STRAVA_JOB_IDS.syncActivity,
    maxDuration: 300,
    retry: {
        maxAttempts: 5,
        factor: 2,
        minTimeoutInMs: 2000,
        maxTimeoutInMs: 120_000,
        randomize: true,
    },
    catchError: stravaCatchError,
    onSuccess: async ({ payload }: { payload: Payload }) => {
        if (payload.eventId !== null)
            await settleStravaEvent(payload.userId, payload.eventId, 'processed')
        // A debounced run carries only the last event of a burst: settle the others as well.
        await settleStravaActivityEvents(payload.userId, payload.stravaActivityId)
    },
    // Runs once, after the retries are exhausted or a failure was marked non-retryable.
    onFailure: async ({ payload, error }: { payload: Payload; error: unknown }) => {
        if (payload.eventId !== null)
            await settleStravaEvent(
                payload.userId,
                payload.eventId,
                'failed',
                failureEventMessage(error)
            )
    },
    run: (payload: Payload) =>
        runStravaJob(syncStravaActivity(payload.userId, payload.stravaActivityId)),
})
