import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    deleteSlotsExcept,
    selectSlots,
    upsertSlots,
} from '@/_bff/modules/athlete/repositories/availability-slots.repository'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'

const ROW = {
    weekday: 2,
    session_kind: 'strength',
    is_fixed: true,
    max_minutes: 90,
    notes: 'gym',
}

const SLOT: AvailabilitySlotDTO = {
    weekday: 2,
    sessionKind: 'strength',
    isFixed: true,
    maxMinutes: 90,
    notes: 'gym',
}

const DENIED = { data: null, error: { code: '42501', message: 'denied' } }

describe('selectSlots', () => {
    it('maps rows to camelCase, filtered by user_id and ordered by weekday then kind', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([ROW]))

        const slots = await Effect.runPromise(selectSlots(supabase, 'user-1'))

        expect(slots).toEqual([SLOT])
        expect(calls[0]?.table).toBe('availability_slots')
        expect(calls[0]?.filters).toEqual([
            ['user_id', 'user-1'],
            ['order:weekday', true],
            ['order:session_kind', true],
        ])
    })

    it('returns an empty list without rows', async () => {
        const { supabase } = makeFakeAdminDb(() => ok([]))

        expect(await Effect.runPromise(selectSlots(supabase, 'user-1'))).toEqual([])
    })

    it('fails with AvailabilityQueryError on returned, thrown and malformed results', async () => {
        const returned = makeFakeAdminDb(() => DENIED)
        const thrown = makeFakeAdminDb(() => new Error('down'))
        const malformed = makeFakeAdminDb(() => ok([{ ...ROW, session_kind: 'swim' }]))

        const exits = await Promise.all(
            [returned, thrown, malformed].map(({ supabase }) =>
                Effect.runPromiseExit(selectSlots(supabase, 'user-1'))
            )
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual([
            'AvailabilityQueryError',
            'AvailabilityQueryError',
            'AvailabilityQueryError',
        ])
    })
})

describe('upsertSlots', () => {
    it('upserts snake_case rows with user_id on the composite conflict key', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(upsertSlots(supabase, 'user-1', [SLOT]))

        expect(calls[0]?.op).toBe('upsert')
        expect(calls[0]?.options).toEqual({ onConflict: 'user_id,weekday,session_kind' })
        expect(calls[0]?.payload).toEqual([
            {
                user_id: 'user-1',
                weekday: 2,
                session_kind: 'strength',
                is_fixed: true,
                max_minutes: 90,
                notes: 'gym',
            },
        ])
    })

    it('makes no query for an empty list', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(upsertSlots(supabase, 'user-1', []))

        expect(calls).toHaveLength(0)
    })

    it('fails with AvailabilityQueryError on a returned error and on a rejection', async () => {
        const returned = makeFakeAdminDb(() => DENIED)
        const thrown = makeFakeAdminDb(() => new Error('down'))

        const exits = await Promise.all(
            [returned, thrown].map(({ supabase }) =>
                Effect.runPromiseExit(upsertSlots(supabase, 'user-1', [SLOT]))
            )
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual([
            'AvailabilityQueryError',
            'AvailabilityQueryError',
        ])
    })
})

describe('deleteSlotsExcept', () => {
    it('deletes every slot of the user when keep is empty', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(deleteSlotsExcept(supabase, 'user-1', []))

        expect(calls).toHaveLength(1)
        expect(calls[0]?.op).toBe('delete')
        expect(calls[0]?.filters).toEqual([['user_id', 'user-1']])
    })

    it('deletes only the stale pairs, one delete per weekday, always scoped by user_id', async () => {
        const current = [
            { weekday: 1, session_kind: 'run' },
            { weekday: 1, session_kind: 'cross' },
            { weekday: 1, session_kind: 'strength' },
            { weekday: 2, session_kind: 'hyrox' },
            { weekday: 3, session_kind: 'rest' },
        ]
        const { calls, supabase } = makeFakeAdminDb((call) =>
            call.op === 'select' ? ok(current) : ok()
        )

        await Effect.runPromise(
            deleteSlotsExcept(supabase, 'user-1', [
                { weekday: 1, sessionKind: 'run' },
                { weekday: 3, sessionKind: 'rest' },
            ])
        )

        expect(calls[0]?.op).toBe('select')
        expect(calls[0]?.filters).toEqual([['user_id', 'user-1']])
        const deletes = calls.filter((call) => call.op === 'delete')
        expect(deletes.map((call) => call.filters)).toEqual([
            [
                ['user_id', 'user-1'],
                ['weekday', 1],
                ['session_kind:in', ['cross', 'strength']],
            ],
            [
                ['user_id', 'user-1'],
                ['weekday', 2],
                ['session_kind:in', ['hyrox']],
            ],
        ])
    })

    it('deletes nothing when every current slot is kept', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([{ weekday: 1, session_kind: 'run' }]))

        await Effect.runPromise(
            deleteSlotsExcept(supabase, 'user-1', [{ weekday: 1, sessionKind: 'run' }])
        )

        expect(calls.filter((call) => call.op === 'delete')).toHaveLength(0)
    })

    it('fails with AvailabilityQueryError on returned and thrown errors in every step', async () => {
        const keep = [{ weekday: 1, sessionKind: 'run' }]
        const stale = [{ weekday: 2, session_kind: 'run' }]
        const clients = [
            makeFakeAdminDb(() => DENIED),
            makeFakeAdminDb(() => new Error('down')),
            makeFakeAdminDb(() => ok([{ weekday: 2, session_kind: 'swim' }])),
            makeFakeAdminDb((call) => (call.op === 'select' ? ok(stale) : DENIED)),
            makeFakeAdminDb((call) => (call.op === 'select' ? ok(stale) : new Error('down'))),
        ]

        const exits = await Promise.all(
            clients.map(({ supabase }) =>
                Effect.runPromiseExit(deleteSlotsExcept(supabase, 'user-1', keep))
            )
        )
        const emptyKeep = await Promise.all(
            [makeFakeAdminDb(() => DENIED), makeFakeAdminDb(() => new Error('down'))].map(
                ({ supabase }) => Effect.runPromiseExit(deleteSlotsExcept(supabase, 'user-1', []))
            )
        )

        expect([...exits, ...emptyKeep].map((exit) => failureTag(exit))).toEqual(
            Array.from({ length: 7 }, () => 'AvailabilityQueryError')
        )
    })
})
