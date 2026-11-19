import 'server-only'

import { tasks } from '@trigger.dev/sdk'
import { Effect } from 'effect'
import { ServerEnv } from '@/env/server'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { EnqueueStravaJobError } from '@/_bff/lib/errors'
import { STRAVA_JOB_IDS } from '@/_bff/modules/strava/constants'
import { redact } from '@/_bff/modules/strava/helpers/strava-api.client'
import type { backfillStravaJob } from '@/_bff/modules/strava/jobs/backfill-strava.job'
import type { syncMissingStravaJob } from '@/_bff/modules/strava/jobs/sync-missing-strava.job'
import type { syncStravaActivityJob } from '@/_bff/modules/strava/jobs/sync-strava-activity.job'
import type { verifyStravaDeauthorizationJob } from '@/_bff/modules/strava/jobs/verify-strava-deauthorization.job'

type SyncActivityPayload = { userId: string; stravaActivityId: number; eventId: string | null }

type VerifyPayload = { userId: string; eventId: string | null }

type IdempotencyOptions = { idempotencyKey: string; idempotencyKeyTTL: string }

type DebounceOptions = {
    debounce: { key: string; delay: string; maxDelay: string; mode: 'trailing' }
}

type TriggerOptions = IdempotencyOptions | DebounceOptions

// The SDK's request options: the webhook path asks for a single attempt, see WEBHOOK_REQUEST.
type RequestOptions = { retry: { maxAttempts: number } }

// The webhook is unsigned, so forged events with fresh `event_time` values pass the event table's
// dedupe. An activity sync is debounced per athlete and activity: a burst of events (create, then
// edits) collapses into one delayed run that carries the last event and fetches the final state,
// and an event after the run started creates a new run, so an edit is never dropped. A
// verification is cheap and idempotent, so it uses a per-user idempotency key instead.
const SYNC_ACTIVITY_DEBOUNCE_DELAY = '30s'
const SYNC_ACTIVITY_DEBOUNCE_MAX_DELAY = '5m'
const VERIFY_TTL = '5m'
const BACKFILL_TTL = '1h'
const SYNC_MISSING_TTL = '2m'

// The webhook POST must not wait for several SDK retries: one attempt, and a failure marks the
// event failed.
const WEBHOOK_REQUEST: RequestOptions = { retry: { maxAttempts: 1 } }

const MS_PER_MINUTE = 60_000

// The SDK error is reduced to its redacted text: it can echo the request and its authorization
// header, which carries the secret key.
const enqueueFailure = (cause: unknown, secret: string) =>
    new EnqueueStravaJobError({
        cause: redact(
            cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown error',
            [secret]
        ),
        error_hash: ErrorCode.STRAVA_ENQUEUE_TRIGGER,
    })

// Never throws, and never calls the SDK without a secret key: the caller (webhook route, tRPC
// mutation) decides what a failed enqueue means.
const trigger = Effect.fn('enqueueStravaJob')(function* (
    run: (options: TriggerOptions, request?: RequestOptions) => Promise<{ id: string }>,
    options: TriggerOptions,
    request?: RequestOptions
) {
    const secret = ServerEnv.TRIGGER_SECRET_KEY
    if (!secret)
        return yield* new EnqueueStravaJobError({
            cause: 'TRIGGER_SECRET_KEY is not set',
            error_hash: ErrorCode.STRAVA_ENQUEUE_NOT_CONFIGURED,
        })

    yield* Effect.tryPromise({
        // An async wrapper turns a synchronous throw into a rejection too.
        try: async () => await run(options, request),
        catch: (cause) => enqueueFailure(cause, secret),
    })
})

export const enqueueSyncActivity = (payload: SyncActivityPayload) =>
    trigger(
        (options, request) =>
            tasks.trigger<typeof syncStravaActivityJob>(
                STRAVA_JOB_IDS.syncActivity,
                payload,
                options,
                request
            ),
        {
            debounce: {
                key: `${payload.userId}:${payload.stravaActivityId}`,
                delay: SYNC_ACTIVITY_DEBOUNCE_DELAY,
                maxDelay: SYNC_ACTIVITY_DEBOUNCE_MAX_DELAY,
                mode: 'trailing',
            },
        },
        WEBHOOK_REQUEST
    )

export const enqueueVerifyDeauthorization = (payload: VerifyPayload) =>
    trigger(
        (options, request) =>
            tasks.trigger<typeof verifyStravaDeauthorizationJob>(
                STRAVA_JOB_IDS.verifyDeauthorization,
                payload,
                options,
                request
            ),
        { idempotencyKey: `${payload.userId}:verify`, idempotencyKeyTTL: VERIFY_TTL },
        WEBHOOK_REQUEST
    )

export const enqueueBackfill = (userId: string) =>
    trigger(
        (options) =>
            tasks.trigger<typeof backfillStravaJob>(STRAVA_JOB_IDS.backfill, { userId }, options),
        { idempotencyKey: `${userId}:backfill`, idempotencyKeyTTL: BACKFILL_TTL }
    )

// A per-minute key: repeated clicks on "Sync now" within a minute queue one run.
export const enqueueSyncMissing = (userId: string) =>
    trigger(
        (options) =>
            tasks.trigger<typeof syncMissingStravaJob>(
                STRAVA_JOB_IDS.syncMissing,
                { userId },
                options
            ),
        {
            idempotencyKey: `${userId}:sync-missing:${Math.floor(Date.now() / MS_PER_MINUTE)}`,
            idempotencyKeyTTL: SYNC_MISSING_TTL,
        }
    )
