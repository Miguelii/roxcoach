import { describe, expect, it } from 'vitest'
import { Effect, Exit } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    insertEventIfNew,
    markEventStatus,
} from '@/_bff/modules/strava/repositories/strava-webhook-events.repository'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'

const EVENT = {
    user_id: 'user-1',
    owner_id: 12345,
    object_type: 'activity',
    object_id: 987,
    aspect_type: 'create',
    event_time: '2026-11-19T10:00:00.000Z',
}

describe('insertEventIfNew', () => {
    it('inserts a received event ignoring duplicates on the unique key and returns its id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([{ id: 'event-1' }]))

        const result = await Effect.runPromise(insertEventIfNew(supabase, EVENT))

        expect(result).toEqual({ id: 'event-1', isNew: true })
        expect(calls[0]?.table).toBe('strava_webhook_events')
        expect(calls[0]?.op).toBe('upsert')
        expect(calls[0]?.payload).toEqual({ ...EVENT, status: 'received' })
        expect(calls[0]?.options).toEqual({
            onConflict: 'owner_id,object_type,object_id,aspect_type,event_time',
            ignoreDuplicates: true,
        })
    })

    it('reports a redelivery (no row returned) as not new', async () => {
        const { supabase } = makeFakeAdminDb(() => ok([]))

        const result = await Effect.runPromise(insertEventIfNew(supabase, EVENT))

        expect(result.isNew).toBe(false)
    })

    it('accepts a null user_id for an audit row', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([{ id: 'event-2' }]))

        await Effect.runPromise(insertEventIfNew(supabase, { ...EVENT, user_id: null }))

        expect(calls[0]?.payload).toMatchObject({ user_id: null })
    })

    it('fails with WebhookEventError on a returned error without echoing details', async () => {
        const { supabase } = makeFakeAdminDb(() => ({
            data: null,
            error: { code: '42501', message: 'denied', details: 'row secret-detail' },
        }))

        const exit = await Effect.runPromiseExit(insertEventIfNew(supabase, EVENT))

        expect(failureTag(exit)).toBe('WebhookEventError')
        expect(JSON.stringify(exit)).not.toContain('secret-detail')
    })

    it('fails with WebhookEventError when the query rejects', async () => {
        const { supabase } = makeFakeAdminDb(() => new Error('network down'))

        const exit = await Effect.runPromiseExit(insertEventIfNew(supabase, EVENT))

        expect(failureTag(exit)).toBe('WebhookEventError')
    })
})

describe('markEventStatus', () => {
    it('updates the status and the error of the event by id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(markEventStatus(supabase, 'event-1', 'failed', 'StravaApiError'))

        expect(calls[0]?.op).toBe('update')
        expect(calls[0]?.payload).toEqual({ status: 'failed', error: 'StravaApiError' })
        expect(calls[0]?.filters).toEqual([['id', 'event-1']])
    })

    it('stores a null error when none is given', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(markEventStatus(supabase, 'event-1', 'processed'))

        expect(calls[0]?.payload).toEqual({ status: 'processed', error: null })
    })

    it('fails with WebhookEventError on a returned error', async () => {
        const { supabase } = makeFakeAdminDb(() => ({
            data: null,
            error: { code: '42501', message: 'denied' },
        }))

        const exit = await Effect.runPromiseExit(markEventStatus(supabase, 'event-1', 'ignored'))

        expect(Exit.isFailure(exit)).toBe(true)
        expect(failureTag(exit)).toBe('WebhookEventError')
    })
})
