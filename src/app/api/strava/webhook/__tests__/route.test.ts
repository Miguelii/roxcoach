// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { createStravaWebhookHandlers } from '@/_bff/modules/strava/helpers/webhook-route.helper'
import type { StravaWebhookEvent } from '@/_bff/modules/strava/helpers/webhook-payload.helper'
import type { WebhookDecision } from '@/_bff/modules/strava/services/handle-strava-webhook-event.service'

const TOKEN = 'verify-token-value'
const URL_BASE = 'https://roxcoach.test/api/strava/webhook'

const EVENT = {
    object_type: 'activity',
    object_id: 987654321,
    aspect_type: 'create',
    owner_id: 12345,
    event_time: 1763460000,
}

const SYNC: WebhookDecision = {
    action: 'sync',
    userId: 'secret-user-id',
    stravaActivityId: EVENT.object_id,
    eventId: 'event-1',
}

type Payload = { userId: string; stravaActivityId?: number; eventId: string | null }

type Options = {
    token?: string | undefined
    decision?: WebhookDecision
    handleFails?: boolean
    handleThrows?: boolean
    enqueueFails?: boolean
    markFails?: boolean
}

const setup = (options: Options = {}) => {
    // An explicit `token: undefined` means unset, so the default applies only when it is absent.
    const token = 'token' in options ? options.token : TOKEN
    const {
        decision = SYNC,
        handleFails = false,
        handleThrows = false,
        enqueueFails = false,
        markFails = false,
    } = options
    const handleEvent = vi.fn((_event: StravaWebhookEvent) => {
        if (handleThrows) throw new Error('boom')
        return handleFails ? Effect.fail('handle failed') : Effect.succeed(decision)
    })
    const enqueueSync = vi.fn((_payload: Payload) =>
        enqueueFails ? Effect.fail('enqueue failed with secret-cause') : Effect.void
    )
    const enqueueVerify = vi.fn((_payload: Payload) =>
        enqueueFails ? Effect.fail('enqueue failed with secret-cause') : Effect.void
    )
    const markFailed = vi.fn((_userId: string, _eventId: string) =>
        markFails ? Effect.fail('mark failed') : Effect.void
    )
    const handlers = createStravaWebhookHandlers({
        getVerifyToken: () => token,
        handleEvent,
        enqueueSync,
        enqueueVerify,
        markFailed,
    })
    return { handlers, handleEvent, enqueueSync, enqueueVerify, markFailed }
}

const get = (handlers: ReturnType<typeof setup>['handlers'], query: string) =>
    handlers.GET(new Request(`${URL_BASE}?${query}`))

const post = (handlers: ReturnType<typeof setup>['handlers'], body: string) =>
    handlers.POST(new Request(URL_BASE, { method: 'POST', body }))

const challenge = (token: string, mode = 'subscribe') =>
    `hub.mode=${mode}&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=abc123`

const expectEmptyOk = async (response: Response) => {
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
}

describe('GET /api/strava/webhook', () => {
    it('returns the challenge for the right token', async () => {
        const response = await get(setup().handlers, challenge(TOKEN))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ 'hub.challenge': 'abc123' })
    })

    it.each([
        ['a wrong token', challenge('nope')],
        ['a longer token', challenge(`${TOKEN}x`)],
        ['a shorter token', challenge('v')],
        ['an empty token', challenge('')],
        ['a missing token', 'hub.mode=subscribe&hub.challenge=abc123'],
        ['a wrong mode', challenge(TOKEN, 'unsubscribe')],
        ['a missing mode', `hub.verify_token=${TOKEN}&hub.challenge=abc123`],
        ['a missing challenge', `hub.mode=subscribe&hub.verify_token=${TOKEN}`],
    ])('returns 403 with an empty body for %s', async (_name, query) => {
        const response = await get(setup().handlers, query)
        expect(response.status).toBe(403)
        expect(await response.text()).toBe('')
    })

    it.each([undefined, ''])('never matches when the configured token is %j', async (token) => {
        const { handlers } = setup({ token })
        const responses = await Promise.all(
            [TOKEN, '', 'undefined'].map((sent) => get(handlers, challenge(sent)))
        )
        expect(responses.map((response) => response.status)).toEqual([403, 403, 403])
        const missing = await get(handlers, 'hub.mode=subscribe&hub.challenge=abc123')
        expect(missing.status).toBe(403)
    })
})

describe('POST /api/strava/webhook', () => {
    it('enqueues exactly one sync for a sync decision and never verifies', async () => {
        const { handlers, handleEvent, enqueueSync, enqueueVerify, markFailed } = setup()
        const response = await post(handlers, JSON.stringify(EVENT))

        await expectEmptyOk(response)
        expect(handleEvent).toHaveBeenCalledWith(EVENT)
        expect(enqueueSync).toHaveBeenCalledTimes(1)
        expect(enqueueSync).toHaveBeenCalledWith({
            userId: 'secret-user-id',
            stravaActivityId: EVENT.object_id,
            eventId: 'event-1',
        })
        expect(enqueueVerify).not.toHaveBeenCalled()
        expect(markFailed).not.toHaveBeenCalled()
    })

    it('enqueues exactly one verification for a deauthorization decision', async () => {
        const { handlers, enqueueSync, enqueueVerify } = setup({
            decision: { action: 'verify_deauthorization', userId: 'secret-user-id', eventId: 'e2' },
        })
        const body = {
            ...EVENT,
            object_type: 'athlete',
            aspect_type: 'update',
            updates: { authorized: 'false' },
        }
        const response = await post(handlers, JSON.stringify(body))

        await expectEmptyOk(response)
        expect(enqueueVerify).toHaveBeenCalledTimes(1)
        expect(enqueueVerify).toHaveBeenCalledWith({ userId: 'secret-user-id', eventId: 'e2' })
        expect(enqueueSync).not.toHaveBeenCalled()
    })

    it('enqueues nothing for an ignored event (unknown owner or duplicate)', async () => {
        const { handlers, enqueueSync, enqueueVerify } = setup({ decision: { action: 'ignore' } })
        await expectEmptyOk(await post(handlers, JSON.stringify(EVENT)))
        expect(enqueueSync).not.toHaveBeenCalled()
        expect(enqueueVerify).not.toHaveBeenCalled()
    })

    it('returns 400 for a body that is not JSON and does nothing', async () => {
        const { handlers, handleEvent } = setup()
        const response = await post(handlers, 'not json')
        expect(response.status).toBe(400)
        expect(handleEvent).not.toHaveBeenCalled()
    })

    it.each([
        ['a string id', { ...EVENT, object_id: '1' }],
        ['a zero owner', { ...EVENT, owner_id: 0 }],
        ['an unsafe id', { ...EVENT, object_id: Number.MAX_SAFE_INTEGER + 1 }],
        ['a missing field', { object_type: 'activity' }],
        ['an array', [EVENT]],
        ['null', null],
    ])('returns 200 and does nothing for a JSON body with %s', async (_name, body) => {
        const { handlers, handleEvent, enqueueSync } = setup()
        await expectEmptyOk(await post(handlers, JSON.stringify(body)))
        expect(handleEvent).not.toHaveBeenCalled()
        expect(enqueueSync).not.toHaveBeenCalled()
    })

    it('marks the event failed with a fixed message when the enqueue fails, and returns 200', async () => {
        const { handlers, markFailed } = setup({ enqueueFails: true })
        const response = await post(handlers, JSON.stringify(EVENT))

        await expectEmptyOk(response)
        expect(markFailed).toHaveBeenCalledTimes(1)
        expect(markFailed).toHaveBeenCalledWith('secret-user-id', 'event-1')
    })

    it('returns 200 when marking the event failed also fails', async () => {
        const { handlers } = setup({ enqueueFails: true, markFails: true })
        await expectEmptyOk(await post(handlers, JSON.stringify(EVENT)))
    })

    it.each([
        ['a failed service', { handleFails: true }],
        ['a throwing service', { handleThrows: true }],
    ])('returns 200 for %s', async (_name, options) => {
        const { handlers, enqueueSync } = setup(options)
        await expectEmptyOk(await post(handlers, JSON.stringify(EVENT)))
        expect(enqueueSync).not.toHaveBeenCalled()
    })

    it('never puts user ids, event details or error text in the response or the logs', async () => {
        const spies = (['log', 'warn', 'error', 'info'] as const).map((level) =>
            vi.spyOn(console, level).mockImplementation(() => {})
        )
        const { handlers } = setup({ enqueueFails: true })
        const response = await post(handlers, JSON.stringify(EVENT))
        const text = await response.text()
        const logged = spies.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)))
        spies.forEach((spy) => spy.mockRestore())

        expect(text).toBe('{}')
        expect(text).not.toContain('secret')
        expect(logged.join('')).not.toContain('secret-cause')
        expect(logged.join('')).not.toContain(TOKEN)
    })
})
