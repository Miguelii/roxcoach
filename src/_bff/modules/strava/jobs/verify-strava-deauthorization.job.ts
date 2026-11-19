import { task } from '@trigger.dev/sdk'
import { STRAVA_JOB_IDS } from '@/_bff/modules/strava/constants'
import {
    failureEventMessage,
    runStravaJob,
    stravaCatchError,
} from '@/_bff/modules/strava/helpers/strava-job.helper'
import { settleStravaEvent } from '@/_bff/modules/strava/services/settle-strava-event.service'
import { verifyStravaDeauthorization } from '@/_bff/modules/strava/services/verify-strava-deauthorization.service'

type Payload = { userId: string; eventId: string | null }

// The deauthorization webhook is unsigned: this job asks Strava whether the grant is really gone
// and only then removes the connection. The queue limit of 1 keeps two verifications from racing
// on the token refresh.
export const verifyStravaDeauthorizationJob = task({
    id: STRAVA_JOB_IDS.verifyDeauthorization,
    maxDuration: 120,
    concurrency: { total: 1 },
    retry: {
        maxAttempts: 4,
        factor: 2,
        minTimeoutInMs: 2000,
        maxTimeoutInMs: 60_000,
        randomize: true,
    },
    catchError: stravaCatchError,
    onSuccess: async ({ payload }: { payload: Payload }) => {
        if (payload.eventId !== null) await settleStravaEvent(payload.eventId, 'processed')
    },
    onFailure: async ({ payload, error }: { payload: Payload; error: unknown }) => {
        if (payload.eventId !== null)
            await settleStravaEvent(payload.eventId, 'failed', failureEventMessage(error))
    },
    run: (payload: Payload) => runStravaJob(verifyStravaDeauthorization(payload.userId)),
})
