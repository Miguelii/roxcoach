// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect, Exit, Cause, Option } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { getAvailability } from '@/_bff/modules/athlete/services/get-availability.service'
import { saveAvailability } from '@/_bff/modules/athlete/services/save-availability.service'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User

const RUN: AvailabilitySlotDTO = {
    weekday: 1,
    sessionKind: 'run',
    isFixed: false,
    maxMinutes: 60,
    notes: null,
}
const HYROX: AvailabilitySlotDTO = { ...RUN, weekday: 2, sessionKind: 'hyrox' }

const DENIED = { data: null, error: { code: '42501', message: 'denied' } }
const CURRENT = [
    { weekday: 1, session_kind: 'run' },
    { weekday: 4, session_kind: 'cross' },
]

describe('getAvailability', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('returns an empty week when there are no rows', async () => {
        const { supabase } = makeFakeAdminDb(() => ok([]))
        createDBServerClientMock.mockResolvedValue(supabase)

        expect(await Effect.runPromise(getAvailability(USER))).toEqual([])
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no cookies'))

        const exit = await Effect.runPromiseExit(getAvailability(USER))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})

describe('saveAvailability', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('rejects invalid input with a reason and writes nothing', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())
        createDBServerClientMock.mockResolvedValue(supabase)

        const exit = await Effect.runPromiseExit(saveAvailability(USER, [RUN, RUN]))

        expect(failureTag(exit)).toBe('AvailabilityValidationError')
        const failure = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : Option.none()
        // SAFETY: the failure is an AvailabilityValidationError, which carries `reason`.
        expect(Option.isSome(failure) && (failure.value as { reason: string }).reason).toBe(
            'duplicate_slot'
        )
        expect(calls).toHaveLength(0)
    })

    it('upserts first, then deletes the stale rows, and returns the saved list', async () => {
        const { calls, supabase } = makeFakeAdminDb((call) =>
            call.op === 'select' ? ok(CURRENT) : ok()
        )
        createDBServerClientMock.mockResolvedValue(supabase)

        const saved = await Effect.runPromise(saveAvailability(USER, [RUN, HYROX]))

        expect(saved).toEqual([RUN, HYROX])
        expect(calls.map((call) => call.op)).toEqual(['upsert', 'select', 'delete'])
        expect(calls[2]?.filters).toEqual([
            ['user_id', 'user-1'],
            ['weekday', 4],
            ['session_kind:in', ['cross']],
        ])
    })

    it('deletes all slots after an empty save (no availability)', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())
        createDBServerClientMock.mockResolvedValue(supabase)

        const saved = await Effect.runPromise(saveAvailability(USER, []))

        expect(saved).toEqual([])
        expect(calls.map((call) => call.op)).toEqual(['delete'])
        expect(calls[0]?.filters).toEqual([['user_id', 'user-1']])
    })

    it('deletes nothing when the upsert fails', async () => {
        const { calls, supabase } = makeFakeAdminDb((call) =>
            call.op === 'upsert' ? DENIED : ok(CURRENT)
        )
        createDBServerClientMock.mockResolvedValue(supabase)

        const exit = await Effect.runPromiseExit(saveAvailability(USER, [RUN]))

        expect(failureTag(exit)).toBe('AvailabilityQueryError')
        expect(calls.map((call) => call.op)).toEqual(['upsert'])
    })

    it('surfaces a failing delete after a successful upsert, which stays written', async () => {
        const { calls, supabase } = makeFakeAdminDb((call) => {
            if (call.op === 'select') return ok(CURRENT)
            return call.op === 'delete' ? DENIED : ok()
        })
        createDBServerClientMock.mockResolvedValue(supabase)

        const exit = await Effect.runPromiseExit(saveAvailability(USER, [RUN]))

        expect(failureTag(exit)).toBe('AvailabilityQueryError')
        expect(calls.map((call) => call.op)).toEqual(['upsert', 'select', 'delete'])
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no cookies'))

        const exit = await Effect.runPromiseExit(saveAvailability(USER, [RUN]))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})
