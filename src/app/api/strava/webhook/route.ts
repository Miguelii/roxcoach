import { Effect } from 'effect'
import { ServerEnv } from '@/env/server'
import { createStravaWebhookHandlers } from '@/_bff/modules/strava/helpers/webhook-route.helper'
import { markEventStatus } from '@/_bff/modules/strava/repositories/strava-webhook-events.repository'
import {
    enqueueSyncActivity,
    enqueueVerifyDeauthorization,
} from '@/_bff/modules/strava/services/enqueue-strava-jobs.service'
import { handleStravaWebhookEvent } from '@/_bff/modules/strava/services/handle-strava-webhook-event.service'
import { createSyncClient } from '@/_bff/modules/strava/services/sync-strava-activity.service'
import { ErrorCode } from '@/_bff/lib/error-codes'

// A fixed message: the enqueue error is never written to the event row.
const ENQUEUE_FAILED_MESSAGE = 'enqueue_failed'

const handlers = createStravaWebhookHandlers({
    getVerifyToken: () => ServerEnv.NEXT_STRAVA_WEBHOOK_VERIFY_TOKEN,
    handleEvent: handleStravaWebhookEvent,
    enqueueSync: enqueueSyncActivity,
    enqueueVerify: enqueueVerifyDeauthorization,
    markFailed: (eventId) =>
        Effect.gen(function* () {
            const supabase = yield* createSyncClient(ErrorCode.STRAVA_WEBHOOK_SB_CLIENT)
            yield* markEventStatus(supabase, eventId, 'failed', ENQUEUE_FAILED_MESSAGE)
        }),
})

export const { GET, POST } = handlers
