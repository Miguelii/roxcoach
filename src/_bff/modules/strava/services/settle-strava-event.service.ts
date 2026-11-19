import 'server-only'

import { Cause, Effect, Exit, Option } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { Logger } from '@/_bff/lib/server-logger'
import { markEventStatus } from '@/_bff/modules/strava/repositories/strava-webhook-events.repository'
import { createSyncClient } from '@/_bff/modules/strava/services/sync-strava-activity.service'

type Status = 'processed' | 'failed'

// Records the outcome of a job on its webhook event. It never fails: a job outcome hook that
// throws would turn a finished sync into a failed run, so a failure here is only logged.
// `error` is a fixed safe message (error tag and hash), never a cause.
export const settleStravaEvent = async (eventId: string, status: Status, error?: string) => {
    const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
            const supabase = yield* createSyncClient(ErrorCode.STRAVA_JOB_EVENT_SB_CLIENT)
            yield* markEventStatus(supabase, eventId, status, error)
        })
    )
    if (Exit.isSuccess(exit)) return

    // Defects (a throwing client factory) are swallowed too: only the first failure's tag is logged.
    const failure = Cause.findErrorOption(exit.cause)
    Logger({
        level: 'error',
        prefix: 'settleStravaEvent',
        message: 'Could not record the job outcome on the webhook event',
        metadata: Option.isSome(failure)
            ? { errorName: failure.value._tag, errorHash: failure.value.error_hash }
            : { errorName: 'Defect', errorHash: null },
    })
}
