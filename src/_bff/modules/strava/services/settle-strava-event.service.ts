import 'server-only'

import { Cause, Effect, Exit, Option } from 'effect'
import type { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { WebhookEventError } from '@/_bff/lib/errors'
import { Logger } from '@/_bff/lib/server-logger'
import {
    markEventStatus,
    markReceivedActivityEventsProcessed,
} from '@/_bff/modules/strava/repositories/strava-webhook-events.repository'
import { createSyncClient } from '@/_bff/modules/strava/services/sync-strava-activity.service'

type Status = 'processed' | 'failed'

// Runs a status write and never fails: a job outcome hook that throws would turn a finished sync
// into a failed run, so a failure here is only logged. Defects (a throwing client factory) are
// swallowed too: only the first failure's tag is logged.
const runSettle = async (
    prefix: string,
    write: (
        supabase: Awaited<ReturnType<typeof createDBAdminClient>>
    ) => Effect.Effect<void, WebhookEventError>
) => {
    const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
            const supabase = yield* createSyncClient(ErrorCode.STRAVA_JOB_EVENT_SB_CLIENT)
            yield* write(supabase)
        })
    )
    if (Exit.isSuccess(exit)) return

    const failure = Cause.findErrorOption(exit.cause)
    Logger({
        level: 'error',
        prefix,
        message: 'Could not record the job outcome on the webhook event',
        metadata: Option.isSome(failure)
            ? { errorName: failure.value._tag, errorHash: failure.value.error_hash }
            : { errorName: 'Defect', errorHash: null },
    })
}

// Records the outcome of a job on its webhook event. `error` is a fixed safe message (error tag
// and hash), never a cause.
export const settleStravaEvent = (
    userId: string,
    eventId: string,
    status: Status,
    error?: string
) =>
    runSettle('settleStravaEvent', (supabase) =>
        markEventStatus(supabase, userId, eventId, status, error)
    )

// Settles the other events of the activity that a debounced run collapsed into itself.
export const settleStravaActivityEvents = (userId: string, stravaActivityId: number) =>
    runSettle('settleStravaActivityEvents', (supabase) =>
        markReceivedActivityEventsProcessed(supabase, userId, stravaActivityId)
    )
