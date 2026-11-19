import { z } from 'zod'

// Ids and the event time are positive safe integers: anything else cannot come from Strava.
const positiveId = z.number().int().positive().safe()

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue | undefined }

// Only string values of `updates` are kept (Strava sends `authorized: "false"`, `private: "true"`).
const updatesSchema = z.record(z.string(), z.unknown()).transform((updates) =>
    Object.fromEntries(
        Object.entries(updates).flatMap(([key, value]) => {
            const text = z.string().safeParse(value)
            return text.success ? [[key, text.data]] : []
        })
    )
)

const webhookEventSchema = z.object({
    object_type: z.string(),
    object_id: positiveId,
    aspect_type: z.string(),
    owner_id: positiveId,
    // Epoch seconds, as Strava sends it.
    event_time: positiveId,
    updates: updatesSchema.optional(),
})

export type StravaWebhookEvent = z.infer<typeof webhookEventSchema>

export const parseWebhookPayload = (
    body: JsonValue
): { ok: true; event: StravaWebhookEvent } | { ok: false } => {
    const parsed = webhookEventSchema.safeParse(body)
    if (!parsed.success) return { ok: false }
    const { updates, ...event } = parsed.data
    return { ok: true, event: updates === undefined ? event : { ...event, updates } }
}
