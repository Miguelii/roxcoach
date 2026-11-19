import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import type { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { WebhookEventError } from '@/_bff/lib/errors'

// Service-role client: strava_webhook_events has no client policy and no grant to `authenticated`.
type AdminClient = ReturnType<typeof createDBAdminClient>

type EventInput = {
    user_id: string | null
    owner_id: number
    object_type: string
    object_id: number
    aspect_type: string
    event_time: string
}

type EventStatus = 'processed' | 'ignored' | 'failed'

const TABLE = 'strava_webhook_events'

const CONFLICT_COLUMNS = 'owner_id,object_type,object_id,aspect_type,event_time'

const insertedRowsSchema = z.array(z.object({ id: z.string() }))

// The unique key makes a redelivered event a no-op: with ignore-duplicates PostgREST returns no
// row for a conflict, so an empty result means the event was already recorded.
export const insertEventIfNew = Effect.fn('insertEventIfNew')(function* (
    supabase: AdminClient,
    input: EventInput
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .upsert(
                    { ...input, status: 'received' },
                    { onConflict: CONFLICT_COLUMNS, ignoreDuplicates: true }
                )
                .select('id'),
        catch: (cause) =>
            new WebhookEventError({
                cause: String(cause),
                error_hash: ErrorCode.STRAVA_EVENT_INSERT,
            }),
    })

    if (error)
        return yield* new WebhookEventError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.STRAVA_EVENT_INSERT_ERR,
        })

    const parsed = insertedRowsSchema.safeParse(data)
    if (!parsed.success)
        return yield* new WebhookEventError({
            cause: 'Inserted rows failed schema validation',
            error_hash: ErrorCode.STRAVA_EVENT_INSERT_ERR,
        })

    const [inserted] = parsed.data
    return inserted ? { id: inserted.id, isNew: true } : { id: '', isNew: false }
})

// `error` is a short safe message (an error tag), never a payload, token or response body.
export const markEventStatus = Effect.fn('markEventStatus')(function* (
    supabase: AdminClient,
    id: string,
    status: EventStatus,
    error?: string
) {
    const { error: returned } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ status, error: error ?? null })
                .eq('id', id),
        catch: (cause) =>
            new WebhookEventError({
                cause: String(cause),
                error_hash: ErrorCode.STRAVA_EVENT_STATUS,
            }),
    })

    if (returned)
        return yield* new WebhookEventError({
            cause: `${returned.code}: ${returned.message}`,
            error_hash: ErrorCode.STRAVA_EVENT_STATUS_ERR,
        })
})
