import { createHash, timingSafeEqual } from 'node:crypto'
import { Cause, Effect, Exit } from 'effect'
import { z } from 'zod'
import { Logger } from '@/_bff/lib/server-logger'
import {
    parseWebhookPayload,
    type StravaWebhookEvent,
} from '@/_bff/modules/strava/helpers/webhook-payload.helper'
import type { WebhookDecision } from '@/_bff/modules/strava/services/handle-strava-webhook-event.service'

type SyncPayload = { userId: string; stravaActivityId: number; eventId: string | null }

type VerifyPayload = { userId: string; eventId: string | null }

type Deps = {
    // Read per request so a rotated token applies without a restart.
    getVerifyToken: () => string | undefined
    handleEvent: (event: StravaWebhookEvent) => Effect.Effect<WebhookDecision, unknown>
    enqueueSync: (payload: SyncPayload) => Effect.Effect<unknown, unknown>
    enqueueVerify: (payload: VerifyPayload) => Effect.Effect<unknown, unknown>
    // Marks the event row failed with a fixed safe message, never the cause.
    markFailed: (userId: string, eventId: string) => Effect.Effect<unknown, unknown>
}

const PREFIX = 'stravaWebhook'

const forbidden = () => new Response(null, { status: 403 })

const ok = () => Response.json({})

// Both sides are hashed first, so the buffers always have the same length: the comparison is
// constant time and a different length is rejected without throwing. An unset or empty configured
// token never matches, not even an empty `hub.verify_token`.
const digest = (value: string) => createHash('sha256').update(value).digest()

const tokenMatches = (configured: string | undefined, received: string | null) => {
    if (!configured || received === null) return false
    return timingSafeEqual(digest(configured), digest(received))
}

const failureSchema = z.object({ _tag: z.string(), error_hash: z.string().optional() })

// Only error tags and hashes are logged: a cause can echo a request, a payload or a secret.
const logFailure = (cause: Cause.Cause<unknown>, step: string) => {
    const failures = cause.reasons.flatMap((reason) => {
        if (!Cause.isFailReason(reason)) return []
        const parsed = failureSchema.safeParse(reason.error)
        return [parsed.success ? parsed.data : { unparsed: true }]
    })
    Logger({ level: 'error', prefix: PREFIX, message: step, metadata: { failures } })
}

const dispatch = (deps: Deps, decision: WebhookDecision) => {
    if (decision.action === 'sync') {
        const { userId, stravaActivityId, eventId } = decision
        return deps
            .enqueueSync({ userId, stravaActivityId, eventId })
            .pipe(Effect.tapError(() => deps.markFailed(userId, eventId).pipe(Effect.ignore)))
    }
    if (decision.action === 'verify_deauthorization') {
        const { userId, eventId } = decision
        return deps
            .enqueueVerify({ userId, eventId })
            .pipe(Effect.tapError(() => deps.markFailed(userId, eventId).pipe(Effect.ignore)))
    }
    return Effect.void
}

// The endpoint is public and unsigned (the proxy matcher excludes `api/`), so it never does
// anything destructive and never reveals whether an athlete exists: every answer to a POST is an
// empty JSON object, except a body that is not JSON.
export const createStravaWebhookHandlers = (deps: Deps) => ({
    GET: async (request: Request) => {
        const params = new URL(request.url).searchParams
        const challenge = params.get('hub.challenge')
        const valid =
            params.get('hub.mode') === 'subscribe' &&
            challenge !== null &&
            tokenMatches(deps.getVerifyToken(), params.get('hub.verify_token'))

        return valid ? Response.json({ 'hub.challenge': challenge }) : forbidden()
    },

    POST: async (request: Request) => {
        let body: Parameters<typeof parseWebhookPayload>[0]
        try {
            body = await request.json()
        } catch {
            return new Response(null, { status: 400 })
        }

        const parsed = parseWebhookPayload(body)
        if (!parsed.ok) return ok()

        try {
            const program = deps
                .handleEvent(parsed.event)
                .pipe(Effect.flatMap((decision) => dispatch(deps, decision)))
            const exit = await Effect.runPromiseExit(program)
            if (Exit.isFailure(exit)) logFailure(exit.cause, 'event handling failed')
        } catch {
            Logger({ level: 'error', prefix: PREFIX, message: 'event handling threw' })
        }
        return ok()
    },
})
