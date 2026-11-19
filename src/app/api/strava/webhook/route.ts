import { Effect } from 'effect'
import { ServerEnv } from '@/env/server'
import { createStravaWebhookHandlers } from '@/_bff/modules/strava/helpers/webhook-route.helper'
import {
    enqueueSyncActivity,
    enqueueVerifyDeauthorization,
} from '@/_bff/modules/strava/services/enqueue-strava-jobs.service'
import { handleStravaWebhookEvent } from '@/_bff/modules/strava/services/handle-strava-webhook-event.service'
import { settleStravaEvent } from '@/_bff/modules/strava/services/settle-strava-event.service'

// A fixed message: the enqueue error is never written to the event row.
const ENQUEUE_FAILED_MESSAGE = 'enqueue_failed'

const handlers = createStravaWebhookHandlers({
    getVerifyToken: () => ServerEnv.NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN,
    handleEvent: handleStravaWebhookEvent,
    enqueueSync: enqueueSyncActivity,
    enqueueVerify: enqueueVerifyDeauthorization,
    // settleStravaEvent never rejects, so the route needs no repository or client of its own.
    markFailed: (userId, eventId) =>
        Effect.promise(() => settleStravaEvent(userId, eventId, 'failed', ENQUEUE_FAILED_MESSAGE)),
})

export const { GET, POST } = handlers
