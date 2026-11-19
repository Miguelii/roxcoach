import { describe, expect, it } from 'vitest'
import { Effect, Exit } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    insertEventIfNew,
    markEventStatus,
    markReceivedActivityEventsProcessed,
} from '@/_bff/modules/strava/repositories/strava-webhook-events.repository'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'

const USER_ID = 'user-1'

const EVENT = {
    owner_id: 12345,
    object_type: 'activity',
    object_id: 987,
    aspect_type: 'create',
    event_time: '2026-11-19T10:00:00.000Z',
}

describe('insertEventIfNew', () => {
    it('inserts a received event ignoring duplicates on the unique key and returns its id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([{ id: 'event-1' }]))

        const result = await Effect.runPromise(insertEventIfNew(supabase, USER_ID, EVENT))

        expect(result).toEqual({ id: 'event-1', isNew: true })
        expect(calls[0]?.table).toBe('strava_webhook_events')
        expect(calls[0]?.op).toBe('upsert')
        expect(calls[0]?.payload).toEqual({ ...EVENT, user_id: USER_ID, status: 'received' })
        expect(calls[0]?.options).toEqual({
            onConflict: 'owner_id,object_type,object_id,aspect_type,event_time',
            ignoreDuplicates: true,
        })
    })

    it('reports a redelivery (no row returned) as not new', async () => {
        const { supabase } = makeFakeAdminDb(() => ok([]))

        const result = await Effect.runPromise(insertEventIfNew(supabase, USER_ID, EVENT))

        expect(result).toEqual({ isNew: false })
    })

    it('writes the given user as the row owner', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([{ id: 'event-2' }]))

        await Effect.runPromise(insertEventIfNew(supabase, 'user-9', EVENT))

        expect(calls[0]?.payload).toMatchObject({ user_id: 'user-9' })
    })

    it('fails with WebhookEventError on a returned error without echoing details', async () => {
        const { supabase } = makeFakeAdminDb(() => ({
            data: null,
            error: { code: '42501', message: 'denied', details: 'row secret-detail' },
        }))

        const exit = await Effect.runPromiseExit(insertEventIfNew(supabase, USER_ID, EVENT))

        expect(failureTag(exit)).toBe('WebhookEventError')
        expect(JSON.stringify(exit)).not.toContain('secret-detail')
    })

    it('fails with WebhookEventError when the query rejects', async () => {
        const { supabase } = makeFakeAdminDb(() => new Error('network down'))

        const exit = await Effect.runPromiseExit(insertEventIfNew(supabase, USER_ID, EVENT))

        expect(failureTag(exit)).toBe('WebhookEventError')
    })
})

describe('markEventStatus', () => {
    it('updates the status and the error of the event by id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(
            markEventStatus(supabase, USER_ID, 'event-1', 'failed', 'StravaApiError')
        )

        expect(calls[0]?.op).toBe('update')
        expect(calls[0]?.payload).toEqual({ status: 'failed', error: 'StravaApiError' })
        expect(calls[0]?.filters).toEqual([
            ['id', 'event-1'],
            ['user_id', USER_ID],
        ])
    })

    it('does not update an event of another user', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(markEventStatus(supabase, 'user-2', 'event-1', 'processed'))

        expect(calls[0]?.filters).toContainEqual(['user_id', 'user-2'])
        expect(calls[0]?.filters).not.toContainEqual(['user_id', USER_ID])
    })

    it('stores a null error when none is given', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(markEventStatus(supabase, USER_ID, 'event-1', 'processed'))

        expect(calls[0]?.payload).toEqual({ status: 'processed', error: null })
    })

    it('fails with WebhookEventError on a returned error', async () => {
        const { supabase } = makeFakeAdminDb(() => ({
            data: null,
            error: { code: '42501', message: 'denied' },
        }))

        const exit = await Effect.runPromiseExit(
            markEventStatus(supabase, USER_ID, 'event-1', 'ignored')
        )

        expect(Exit.isFailure(exit)).toBe(true)
        expect(failureTag(exit)).toBe('WebhookEventError')
    })
})

describe('markReceivedActivityEventsProcessed', () => {
    it('settles the still received events of the user and activity', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(markReceivedActivityEventsProcessed(supabase, USER_ID, 987))

        expect(calls[0]?.op).toBe('update')
        expect(calls[0]?.payload).toEqual({ status: 'processed', error: null })
        expect(calls[0]?.filters).toEqual([
            ['user_id', USER_ID],
            ['object_type', 'activity'],
            ['object_id', 987],
            ['status', 'received'],
        ])
    })

    it('fails with WebhookEventError on a returned error', async () => {
        const { supabase } = makeFakeAdminDb(() => ({
            data: null,
            error: { code: '42501', message: 'denied' },
        }))

        const exit = await Effect.runPromiseExit(
            markReceivedActivityEventsProcessed(supabase, USER_ID, 987)
        )

        expect(failureTag(exit)).toBe('WebhookEventError')
    })
})
