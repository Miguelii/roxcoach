import 'server-only'

import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { WebhookEventError } from '@/_bff/lib/errors'
import { findConnectionByStravaAthleteId } from '@/_bff/modules/strava/repositories/strava-connections.repository'
import {
    insertEventIfNew,
    markEventStatus,
} from '@/_bff/modules/strava/repositories/strava-webhook-events.repository'
import { createSyncClient } from '@/_bff/modules/strava/services/sync-strava-activity.service'

type WebhookEvent = {
    object_type: string
    object_id: number
    aspect_type: string
    owner_id: number
    // Epoch seconds, as Strava sends it.
    event_time: number
    updates?: Record<string, string>
}

export type WebhookDecision =
    | { action: 'ignore' }
    | { action: 'sync'; userId: string; stravaActivityId: number; eventId: string }
    | { action: 'verify_deauthorization'; userId: string; eventId: string }

const OBJECT_TYPES = new Set(['activity', 'athlete'])
const ASPECT_TYPES = new Set(['create', 'update', 'delete'])

const IGNORE: WebhookDecision = { action: 'ignore' }

// Decides what a Strava push event means for the connected athlete. The route answers 200 whatever
// happens here, and an unknown owner or a redelivery is simply ignored, so the response never
// reveals whether an athlete exists. The endpoint is unsigned, so nothing destructive happens here:
// a delete event asks for a sync (Strava's 404 confirms the deletion) and a deauthorization event
// asks for a verification (Strava must reject the grant). The jobs do both.
export const handleStravaWebhookEvent = Effect.fn('handleStravaWebhookEvent')(function* (
    event: WebhookEvent
) {
    // The table checks these two columns, so an unknown value is dropped before any write.
    if (!OBJECT_TYPES.has(event.object_type) || !ASPECT_TYPES.has(event.aspect_type)) return IGNORE

    const supabase = yield* createSyncClient(ErrorCode.STRAVA_WEBHOOK_SB_CLIENT)

    const owner = yield* findConnectionByStravaAthleteId(supabase, event.owner_id)
    if (owner === null) return IGNORE

    const eventTime = yield* Effect.try({
        try: () => new Date(event.event_time * 1000).toISOString(),
        catch: (cause) =>
            new WebhookEventError({ cause, error_hash: ErrorCode.STRAVA_WEBHOOK_EVENT_TIME }),
    })

    const recorded = yield* insertEventIfNew(supabase, {
        user_id: owner.user_id,
        owner_id: event.owner_id,
        object_type: event.object_type,
        object_id: event.object_id,
        aspect_type: event.aspect_type,
        event_time: eventTime,
    })
    if (!recorded.isNew) return IGNORE

    const userId = owner.user_id
    const eventId = recorded.id

    const decide = Effect.gen(function* () {
        if (event.object_type === 'activity') {
            // Create, update and delete all sync. The job marks the event processed or failed.
            return {
                action: 'sync',
                userId,
                stravaActivityId: event.object_id,
                eventId,
            } as const
        }

        if (event.aspect_type === 'update' && event.updates?.authorized === 'false') {
            return { action: 'verify_deauthorization', userId, eventId } as const
        }

        yield* markEventStatus(supabase, eventId, 'ignored')
        return IGNORE
    })

    // A failure is recorded on the event row with the error tag only, then propagates.
    return yield* decide.pipe(
        Effect.tapError((error) =>
            markEventStatus(supabase, eventId, 'failed', error._tag).pipe(
                Effect.catch(() => Effect.void)
            )
        )
    )
})
