// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Effect, type Exit } from 'effect'
import {
    handleStravaWebhookEvent,
    type WebhookDecision,
} from '@/_bff/modules/strava/services/handle-strava-webhook-event.service'
import { failureTag, successValue } from '@/_bff/lib/tests-utils'
import {
    type Call,
    makeFakeAdminDb,
    ok,
    type QueryResult,
} from '@/_bff/modules/strava/services/__tests__/fake-admin-db'

const { createDBAdminClientMock } = vi.hoisted(() => ({ createDBAdminClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBAdminClient: createDBAdminClientMock }))
vi.mock('@/env/server', () => ({ ServerEnv: {} }))

const USER_ID = 'user-1'
const OWNER_ID = 12345
const EVENT_ID = 'event-1'
const EVENT_TIME_S = 1763460000

type EventOverrides = { object_type?: string; event_time?: number }

const activityEvent = (aspectType: string, overrides: EventOverrides = {}) => ({
    object_type: 'activity',
    object_id: 987654321,
    aspect_type: aspectType,
    owner_id: OWNER_ID,
    event_time: EVENT_TIME_S,
    ...overrides,
})

type Options = {
    owner?: boolean
    isNew?: boolean
    fail?: (call: Call) => QueryResult | Error | undefined
}

const setup = ({ owner = true, isNew = true, fail }: Options = {}) => {
    const db = makeFakeAdminDb((call) => {
        const failure = fail?.(call)
        if (failure) return failure
        if (call.table === 'strava_connections' && call.op === 'select')
            return ok(owner ? { user_id: USER_ID } : null)
        if (call.table === 'strava_webhook_events' && call.op === 'upsert')
            return ok(isNew ? [{ id: EVENT_ID }] : [])
        return ok()
    })
    createDBAdminClientMock.mockReturnValue(db.supabase)
    return db
}

const eventWrites = (db: ReturnType<typeof setup>) =>
    db.calls.filter((call) => call.table === 'strava_webhook_events')

const run = (event: Parameters<typeof handleStravaWebhookEvent>[0]) =>
    Effect.runPromiseExit(handleStravaWebhookEvent(event))

const decisionOf = (exit: Exit.Exit<WebhookDecision, unknown>) => successValue(exit)

describe('handleStravaWebhookEvent', () => {
    afterEach(() => vi.clearAllMocks())

    it('ignores an unknown owner without writing any event row', async () => {
        const db = setup({ owner: false })

        const exit = await run(activityEvent('create'))

        expect(decisionOf(exit)).toEqual({ action: 'ignore' })
        expect(eventWrites(db)).toHaveLength(0)
        expect(db.calls.filter((call) => call.op !== 'select')).toHaveLength(0)
    })

    it('looks the owner up by Strava athlete id', async () => {
        const db = setup()

        await run(activityEvent('create'))

        expect(db.calls[0]?.table).toBe('strava_connections')
        expect(db.calls[0]?.filters).toEqual([['strava_athlete_id', OWNER_ID]])
    })

    it('ignores a redelivered event', async () => {
        const db = setup({ isNew: false })

        const exit = await run(activityEvent('create'))

        expect(decisionOf(exit)).toEqual({ action: 'ignore' })
        expect(eventWrites(db)).toHaveLength(1)
        expect(db.calls.some((call) => call.table === 'activities')).toBe(false)
    })

    it('records a new event with the ISO event time and asks for a sync on create', async () => {
        const db = setup()

        const exit = await run(activityEvent('create'))

        expect(decisionOf(exit)).toEqual({
            action: 'sync',
            userId: USER_ID,
            stravaActivityId: 987654321,
            eventId: EVENT_ID,
        })
        expect(eventWrites(db)[0]?.payload).toEqual({
            user_id: USER_ID,
            owner_id: OWNER_ID,
            object_type: 'activity',
            object_id: 987654321,
            aspect_type: 'create',
            event_time: new Date(EVENT_TIME_S * 1000).toISOString(),
            status: 'received',
        })
        // The job marks it processed or failed: nothing else is written here.
        expect(eventWrites(db)).toHaveLength(1)
    })

    it('asks for a sync on update', async () => {
        setup()

        const exit = await run(activityEvent('update'))

        expect(decisionOf(exit)).toMatchObject({ action: 'sync', eventId: EVENT_ID })
    })

    it('soft-deletes the activity on delete and marks the event processed', async () => {
        const db = setup()

        const exit = await run(activityEvent('delete'))

        expect(decisionOf(exit)).toEqual({ action: 'deleted' })
        const softDelete = db.calls.find((call) => call.table === 'activities')
        expect(softDelete?.op).toBe('update')
        expect(softDelete?.payload).toMatchObject({ deleted_at: expect.any(String) })
        expect(softDelete?.filters).toContainEqual(['strava_id', 987654321])
        expect(softDelete?.filters).toContainEqual(['user_id', USER_ID])
        const marked = eventWrites(db).find((call) => call.op === 'update')
        expect(marked?.payload).toEqual({ status: 'processed', error: null })
        expect(marked?.filters).toEqual([['id', EVENT_ID]])
    })

    it('marks the event failed with the error tag when the delete fails, and propagates', async () => {
        const db = setup({
            fail: (call) =>
                call.table === 'activities'
                    ? { data: null, error: { code: '42501', message: 'denied' } }
                    : undefined,
        })

        const exit = await run(activityEvent('delete'))

        expect(failureTag(exit)).toBe('ActivityWriteError')
        const marked = eventWrites(db).find((call) => call.op === 'update')
        expect(marked?.payload).toEqual({ status: 'failed', error: 'ActivityWriteError' })
    })

    it('deletes the connection on an athlete update with authorized false', async () => {
        const db = setup()

        const exit = await run({
            object_type: 'athlete',
            object_id: OWNER_ID,
            aspect_type: 'update',
            owner_id: OWNER_ID,
            event_time: EVENT_TIME_S,
            updates: { authorized: 'false' },
        })

        expect(decisionOf(exit)).toEqual({ action: 'deauthorized' })
        const removed = db.calls.find(
            (call) => call.table === 'strava_connections' && call.op === 'delete'
        )
        expect(removed?.filters).toEqual([['user_id', USER_ID]])
        const marked = eventWrites(db).find((call) => call.op === 'update')
        expect(marked?.payload).toEqual({ status: 'processed', error: null })
    })

    it('ignores any other athlete update and keeps the connection', async () => {
        const db = setup()

        const exit = await run({
            object_type: 'athlete',
            object_id: OWNER_ID,
            aspect_type: 'update',
            owner_id: OWNER_ID,
            event_time: EVENT_TIME_S,
            updates: { title: 'new title' },
        })

        expect(decisionOf(exit)).toEqual({ action: 'ignore' })
        expect(
            db.calls.some((call) => call.table === 'strava_connections' && call.op === 'delete')
        ).toBe(false)
        const marked = eventWrites(db).find((call) => call.op === 'update')
        expect(marked?.payload).toEqual({ status: 'ignored', error: null })
    })

    it('ignores an athlete update with no updates', async () => {
        const db = setup()

        const exit = await run({
            object_type: 'athlete',
            object_id: OWNER_ID,
            aspect_type: 'update',
            owner_id: OWNER_ID,
            event_time: EVENT_TIME_S,
        })

        expect(decisionOf(exit)).toEqual({ action: 'ignore' })
        expect(db.calls.some((call) => call.op === 'delete')).toBe(false)
    })

    it('ignores an unknown object type before any database call', async () => {
        const db = setup()

        const exit = await run(activityEvent('create', { object_type: 'subscription' }))

        expect(decisionOf(exit)).toEqual({ action: 'ignore' })
        expect(db.calls).toHaveLength(0)
    })

    it('ignores an unknown aspect type before any database call', async () => {
        const db = setup()

        const exit = await run(activityEvent('archive'))

        expect(decisionOf(exit)).toEqual({ action: 'ignore' })
        expect(db.calls).toHaveLength(0)
    })

    it('fails with WebhookEventError on an out-of-range event time', async () => {
        const db = setup()

        const exit = await run(activityEvent('create', { event_time: 1e20 }))

        expect(failureTag(exit)).toBe('WebhookEventError')
        expect(eventWrites(db)).toHaveLength(0)
    })

    it('fails with CreateSbClientError when the admin client cannot be created', async () => {
        createDBAdminClientMock.mockImplementation(() => {
            throw new Error('missing key')
        })

        const exit = await run(activityEvent('create'))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })

    it('fails with WebhookEventError when the event cannot be recorded', async () => {
        setup({
            fail: (call) =>
                call.table === 'strava_webhook_events'
                    ? { data: null, error: { code: '42501', message: 'denied' } }
                    : undefined,
        })

        const exit = await run(activityEvent('create'))

        expect(failureTag(exit)).toBe('WebhookEventError')
    })

    it('fails with StravaConnectionError when the owner lookup fails', async () => {
        setup({
            fail: (call) =>
                call.table === 'strava_connections'
                    ? { data: null, error: { code: '42501', message: 'denied' } }
                    : undefined,
        })

        const exit = await run(activityEvent('create'))

        expect(failureTag(exit)).toBe('StravaConnectionError')
    })
})
