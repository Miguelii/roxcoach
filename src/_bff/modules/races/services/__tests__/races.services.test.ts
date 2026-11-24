// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeAdminDb, ok, type Call, type Json } from '@/_bff/lib/fake-admin-db'
import {
    cancelRace,
    restoreRace,
    updateRace,
} from '@/_bff/modules/races/services/update-race.service'
import { completeRace } from '@/_bff/modules/races/services/complete-race.service'
import { createRace } from '@/_bff/modules/races/services/create-race.service'
import { deleteRace } from '@/_bff/modules/races/services/delete-race.service'
import { listRaces } from '@/_bff/modules/races/services/list-races.service'
import { listRacesInRange } from '@/_bff/modules/races/services/list-races-in-range.service'
import type { RaceInput } from '@/_bff/modules/races/types'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User
const ID = '11111111-1111-4111-8111-111111111111'

const row = (overrides: Record<string, Json> = {}) => ({
    id: ID,
    name: 'Hyrox Lisbon',
    race_type: 'hyrox',
    race_date: '2026-12-20',
    location: null,
    distance_m: null,
    hyrox_division: 'open_men',
    target_time_s: 4200,
    priority: 'A',
    status: 'upcoming',
    result_time_s: null,
    notes: null,
    ...overrides,
})

const INPUT: RaceInput = {
    name: 'Hyrox Lisbon',
    raceType: 'hyrox',
    raceDate: '2026-12-20',
    location: null,
    distanceM: null,
    hyroxDivision: 'open_men',
    targetTimeS: 4200,
    priority: 'A',
    notes: null,
}

type Options = { timezone?: string; race?: Record<string, Json> | null }

// Answers the profile timezone, the existing race lookup, and every write with the race row.
const setup = ({ timezone = 'Europe/Lisbon', race = row() }: Options = {}) => {
    const db = makeFakeAdminDb((call: Call) => {
        if (call.table === 'athlete_profiles') return ok({ timezone })
        if (call.op === 'delete') return ok(race ? [{ id: ID }] : [])
        return ok(race)
    })
    createDBServerClientMock.mockResolvedValue(db.supabase)
    return db
}

const writes = (calls: Call[]) => calls.filter((call) => call.op !== 'select')

describe('races services', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('createRace uses the athlete timezone for "today"', async () => {
        // 23:30 UTC on 2026-12-19 is already 2026-12-20 in Auckland-like zones but still the
        // 19th in Lisbon: a race on the 20th is future in Lisbon and today in Pacific/Auckland.
        vi.setSystemTime(new Date('2026-12-19T23:30:00Z'))
        const lisbon = setup({ timezone: 'Europe/Lisbon' })
        const created = await Effect.runPromise(createRace(USER, INPUT))
        expect(created.id).toBe(ID)
        expect(writes(lisbon.calls)).toHaveLength(1)

        const auckland = setup({ timezone: 'Pacific/Auckland' })
        const exit = await Effect.runPromiseExit(createRace(USER, INPUT))
        expect(failureTag(exit)).toBe('RaceValidationError')
        expect(writes(auckland.calls)).toHaveLength(0)
    })

    it('createRace rejects a past date and invalid input without writing', async () => {
        vi.setSystemTime(new Date('2026-11-20T12:00:00Z'))
        const { calls } = setup()

        const exit = await Effect.runPromiseExit(
            createRace(USER, { ...INPUT, raceDate: '2026-11-20' })
        )

        expect(failureTag(exit)).toBe('RaceValidationError')
        expect(writes(calls)).toHaveLength(0)
    })

    it('updateRace maps a missing race to RaceNotFoundError', async () => {
        vi.setSystemTime(new Date('2026-11-20T12:00:00Z'))
        setup({ race: null })

        expect(failureTag(await Effect.runPromiseExit(updateRace(USER, ID, INPUT)))).toBe(
            'RaceNotFoundError'
        )
    })

    it('updateRace lets a completed race keep a past date', async () => {
        vi.setSystemTime(new Date('2026-11-20T12:00:00Z'))
        const past = row({ status: 'completed', result_time_s: 4000, race_date: '2026-01-10' })
        setup({ race: past })

        const updated = await Effect.runPromise(
            updateRace(USER, ID, { ...INPUT, raceDate: '2026-01-11', name: 'Renamed' })
        )

        expect(updated.status).toBe('completed')
    })

    it('updateRace rejects moving an upcoming race into the past', async () => {
        vi.setSystemTime(new Date('2026-11-20T12:00:00Z'))
        setup()

        const exit = await Effect.runPromiseExit(
            updateRace(USER, ID, { ...INPUT, raceDate: '2026-11-01' })
        )

        expect(failureTag(exit)).toBe('RaceValidationError')
    })

    it('completeRace fails with RaceStateError on a cancelled race, without writing', async () => {
        const { calls } = setup({ race: row({ status: 'cancelled' }) })

        const exit = await Effect.runPromiseExit(completeRace(USER, ID, 4100))

        expect(failureTag(exit)).toBe('RaceStateError')
        expect(writes(calls)).toHaveLength(0)
    })

    it('completeRace records the result and validates it', async () => {
        const { calls } = setup()

        await Effect.runPromise(completeRace(USER, ID, 4100))
        const invalid = await Effect.runPromiseExit(completeRace(USER, ID, 0))

        expect(writes(calls)[0]?.payload).toEqual({ result_time_s: 4100, status: 'completed' })
        expect(failureTag(invalid)).toBe('RaceValidationError')
    })

    it('completeRace maps a missing race to RaceNotFoundError', async () => {
        setup({ race: null })

        expect(failureTag(await Effect.runPromiseExit(completeRace(USER, ID, 4100)))).toBe(
            'RaceNotFoundError'
        )
    })

    it('cancelRace sets the status and refuses a completed race', async () => {
        const first = setup()
        await Effect.runPromise(cancelRace(USER, ID))
        expect(writes(first.calls)[0]?.payload).toEqual({ status: 'cancelled' })

        setup({ race: row({ status: 'completed', result_time_s: 4000 }) })
        expect(failureTag(await Effect.runPromiseExit(cancelRace(USER, ID)))).toBe('RaceStateError')

        setup({ race: null })
        expect(failureTag(await Effect.runPromiseExit(cancelRace(USER, ID)))).toBe(
            'RaceNotFoundError'
        )
    })

    it('restoreRace brings a cancelled race back to upcoming while its date has not passed', async () => {
        vi.setSystemTime(new Date('2026-12-20T12:00:00Z'))
        const today = setup({ race: row({ status: 'cancelled', race_date: '2026-12-20' }) })
        await Effect.runPromise(restoreRace(USER, ID))
        expect(writes(today.calls)[0]?.payload).toEqual({ status: 'upcoming' })

        const past = setup({ race: row({ status: 'cancelled', race_date: '2026-12-19' }) })
        expect(failureTag(await Effect.runPromiseExit(restoreRace(USER, ID)))).toBe(
            'RaceStateError'
        )
        expect(writes(past.calls)).toHaveLength(0)
    })

    it('restoreRace refuses a race that is not cancelled and reports a missing one', async () => {
        vi.setSystemTime(new Date('2026-11-20T12:00:00Z'))
        const upcoming = setup({ race: row({ status: 'upcoming' }) })
        expect(failureTag(await Effect.runPromiseExit(restoreRace(USER, ID)))).toBe(
            'RaceStateError'
        )
        expect(writes(upcoming.calls)).toHaveLength(0)

        setup({ race: row({ status: 'completed', result_time_s: 4000 }) })
        expect(failureTag(await Effect.runPromiseExit(restoreRace(USER, ID)))).toBe(
            'RaceStateError'
        )

        setup({ race: null })
        expect(failureTag(await Effect.runPromiseExit(restoreRace(USER, ID)))).toBe(
            'RaceNotFoundError'
        )
    })

    it('cancelRace maps a lost race against completion to RaceStateError', async () => {
        let selects = 0
        const db = makeFakeAdminDb((call: Call) => {
            if (call.op === 'update') return ok(null)
            selects += 1
            return ok(selects === 1 ? row() : row({ status: 'completed', result_time_s: 4000 }))
        })
        createDBServerClientMock.mockResolvedValue(db.supabase)
        expect(failureTag(await Effect.runPromiseExit(cancelRace(USER, ID)))).toBe('RaceStateError')

        selects = 0
        const gone = makeFakeAdminDb((call: Call) => {
            if (call.op === 'update') return ok(null)
            selects += 1
            return ok(selects === 1 ? row() : null)
        })
        createDBServerClientMock.mockResolvedValue(gone.supabase)
        expect(failureTag(await Effect.runPromiseExit(cancelRace(USER, ID)))).toBe(
            'RaceNotFoundError'
        )
    })

    it('deleteRace removes an upcoming race and refuses a completed one', async () => {
        const first = setup()
        expect(await Effect.runPromise(deleteRace(USER, ID))).toEqual({ id: ID })
        expect(writes(first.calls)[0]?.op).toBe('delete')

        const second = setup({ race: row({ status: 'completed', result_time_s: 4000 }) })
        expect(failureTag(await Effect.runPromiseExit(deleteRace(USER, ID)))).toBe('RaceStateError')
        expect(writes(second.calls)).toHaveLength(0)

        setup({ race: null })
        expect(failureTag(await Effect.runPromiseExit(deleteRace(USER, ID)))).toBe(
            'RaceNotFoundError'
        )
    })

    it('listRaces passes the status filter through', async () => {
        const { calls } = makeFakeAdminDb(() => ok([row()]))
        createDBServerClientMock.mockResolvedValue(makeFakeAdminDb(() => ok([row()])).supabase)
        const db = makeFakeAdminDb(() => ok([row()]))
        createDBServerClientMock.mockResolvedValue(db.supabase)

        const races = await Effect.runPromise(listRaces(USER, { status: ['upcoming'] }))

        expect(races).toHaveLength(1)
        expect(db.calls[0]?.filters).toContainEqual(['status:in', ['upcoming']])
        expect(calls).toHaveLength(0)
    })

    it('listRacesInRange excludes cancelled races and bounds the dates', async () => {
        const db = makeFakeAdminDb(() => ok([]))
        createDBServerClientMock.mockResolvedValue(db.supabase)

        await Effect.runPromise(listRacesInRange(USER, '2026-12-01', '2026-12-31'))

        expect(db.calls[0]?.filters).toEqual([
            ['user_id', 'user-1'],
            ['status:in', ['upcoming', 'completed']],
            ['race_date:gte', '2026-12-01'],
            ['race_date:lte', '2026-12-31'],
            ['order:race_date', true],
            ['order:id', true],
        ])
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no cookies'))

        expect(failureTag(await Effect.runPromiseExit(listRaces(USER, {})))).toBe(
            'CreateSbClientError'
        )
    })
})
