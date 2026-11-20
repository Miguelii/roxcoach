import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeAdminDb, ok, type Call } from '@/_bff/lib/fake-admin-db'
import {
    deleteRace,
    insertRace,
    selectRaceById,
    selectRaces,
    setRaceResult,
    setRaceStatus,
    updateRace,
} from '@/_bff/modules/races/repositories/races.repository'
import type { RaceDTO, RaceInput } from '@/_bff/modules/races/types'

const ID = '11111111-1111-4111-8111-111111111111'

const ROW = {
    id: ID,
    name: 'Hyrox Lisbon',
    race_type: 'hyrox',
    race_date: '2027-03-06',
    location: null,
    distance_m: null,
    hyrox_division: 'open_men',
    target_time_s: 4200,
    priority: 'A',
    status: 'upcoming',
    result_time_s: null,
    notes: null,
}

const RACE: RaceDTO = {
    id: ID,
    name: 'Hyrox Lisbon',
    raceType: 'hyrox',
    raceDate: '2027-03-06',
    location: null,
    distanceM: null,
    hyroxDivision: 'open_men',
    targetTimeS: 4200,
    priority: 'A',
    status: 'upcoming',
    resultTimeS: null,
    notes: null,
}

const INPUT: RaceInput = {
    name: ' Hyrox Lisbon ',
    raceType: 'hyrox',
    raceDate: '2027-03-06',
    location: null,
    distanceM: null,
    hyroxDivision: 'open_men',
    targetTimeS: 4200,
    priority: 'A',
    notes: null,
}

const DENIED = { data: null, error: { code: '42501', message: 'denied' } }

// A fake with two users' rows: only rows matching every id and user_id filter are affected.
const twoUsersDb = () => {
    const rows = [
        { ...ROW, user_id: 'user-1' },
        { ...ROW, id: '22222222-2222-4222-8222-222222222222', user_id: 'user-2' },
    ]
    return makeFakeAdminDb((call: Call) => {
        const value = (column: string) => call.filters.find(([name]) => name === column)?.[1]
        const match = rows.filter(
            (row) => row.id === value('id') && row.user_id === value('user_id')
        )
        if (call.op === 'delete') return ok(match.map((row) => ({ id: row.id })))
        return ok(match[0] ? { ...match[0] } : null)
    })
}
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

describe('selectRaces', () => {
    it('maps to camelCase keeping null, filtered by user_id, ordered by date then id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([ROW]))

        const races = await Effect.runPromise(selectRaces(supabase, 'user-1', {}))

        expect(races).toEqual([RACE])
        expect(calls[0]?.table).toBe('races')
        expect(calls[0]?.filters).toEqual([
            ['user_id', 'user-1'],
            ['order:race_date', true],
            ['order:id', true],
        ])
    })

    it('applies the status and date range filters', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok([]))

        await Effect.runPromise(
            selectRaces(supabase, 'user-1', {
                status: ['upcoming', 'completed'],
                from: '2027-01-01',
                to: '2027-01-31',
            })
        )

        expect(calls[0]?.filters).toEqual([
            ['user_id', 'user-1'],
            ['status:in', ['upcoming', 'completed']],
            ['race_date:gte', '2027-01-01'],
            ['race_date:lte', '2027-01-31'],
            ['order:race_date', true],
            ['order:id', true],
        ])
    })

    it('fails with RaceQueryError on returned, thrown and malformed results', async () => {
        const dbs = [
            makeFakeAdminDb(() => DENIED),
            makeFakeAdminDb(() => new Error('down')),
            makeFakeAdminDb(() => ok([{ ...ROW, priority: 'Z' }])),
        ]

        const exits = await Promise.all(
            dbs.map(({ supabase }) => Effect.runPromiseExit(selectRaces(supabase, 'user-1', {})))
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual([
            'RaceQueryError',
            'RaceQueryError',
            'RaceQueryError',
        ])
    })
})

describe('selectRaceById', () => {
    it('combines id with user_id and returns null for another user', async () => {
        const { calls, supabase } = twoUsersDb()

        expect(await Effect.runPromise(selectRaceById(supabase, 'user-1', ID))).toEqual(RACE)
        expect(await Effect.runPromise(selectRaceById(supabase, 'user-1', OTHER_ID))).toBeNull()
        expect(calls[0]?.filters).toEqual([
            ['id', ID],
            ['user_id', 'user-1'],
        ])
    })
})

describe('insertRace', () => {
    it('inserts snake_case columns with user_id and a trimmed name', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(ROW))

        const race = await Effect.runPromise(insertRace(supabase, 'user-1', INPUT))

        expect(race).toEqual(RACE)
        expect(calls[0]?.op).toBe('insert')
        expect(calls[0]?.payload).toEqual({
            user_id: 'user-1',
            name: 'Hyrox Lisbon',
            race_type: 'hyrox',
            race_date: '2027-03-06',
            location: null,
            distance_m: null,
            hyrox_division: 'open_men',
            target_time_s: 4200,
            priority: 'A',
            notes: null,
        })
    })

    it('fails with RaceQueryError when the insert errors or returns nothing', async () => {
        const failing = makeFakeAdminDb(() => DENIED)
        const empty = makeFakeAdminDb(() => ok(null))

        expect(
            failureTag(await Effect.runPromiseExit(insertRace(failing.supabase, 'user-1', INPUT)))
        ).toBe('RaceQueryError')
        expect(
            failureTag(await Effect.runPromiseExit(insertRace(empty.supabase, 'user-1', INPUT)))
        ).toBe('RaceQueryError')
    })
})

describe('updateRace', () => {
    it('updates by id and user_id without touching status or result', async () => {
        const { calls, supabase } = twoUsersDb()

        const race = await Effect.runPromise(updateRace(supabase, 'user-1', ID, INPUT))

        expect(race).toEqual(RACE)
        expect(calls[0]?.filters).toEqual([
            ['id', ID],
            ['user_id', 'user-1'],
        ])
        expect(calls[0]?.payload).not.toHaveProperty('status')
        expect(calls[0]?.payload).not.toHaveProperty('result_time_s')
    })

    it("returns null for another user's id", async () => {
        const { supabase } = twoUsersDb()

        expect(await Effect.runPromise(updateRace(supabase, 'user-1', OTHER_ID, INPUT))).toBeNull()
    })
})

describe('setRaceResult', () => {
    it('sets the result and completed status, excluding cancelled races', async () => {
        const { calls, supabase } = twoUsersDb()

        await Effect.runPromise(setRaceResult(supabase, 'user-1', ID, 4100))

        expect(calls[0]?.payload).toEqual({ result_time_s: 4100, status: 'completed' })
        expect(calls[0]?.filters).toEqual([
            ['id', ID],
            ['user_id', 'user-1'],
            ['status:neq', 'cancelled'],
        ])
    })

    it("returns null for another user's id", async () => {
        const { supabase } = twoUsersDb()

        expect(
            await Effect.runPromise(setRaceResult(supabase, 'user-1', OTHER_ID, 4100))
        ).toBeNull()
    })
})

describe('setRaceStatus', () => {
    it('sets the status by id and user_id, and returns null for another user', async () => {
        const { calls, supabase } = twoUsersDb()

        await Effect.runPromise(setRaceStatus(supabase, 'user-1', ID, 'cancelled'))
        const other = await Effect.runPromise(
            setRaceStatus(supabase, 'user-1', OTHER_ID, 'cancelled')
        )

        expect(calls[0]?.payload).toEqual({ status: 'cancelled' })
        expect(calls[0]?.filters).toEqual([
            ['id', ID],
            ['user_id', 'user-1'],
        ])
        expect(other).toBeNull()
    })
})

describe('deleteRace', () => {
    it('deletes only an own race without a result', async () => {
        const { calls, supabase } = twoUsersDb()

        expect(await Effect.runPromise(deleteRace(supabase, 'user-1', ID))).toBe(true)
        expect(calls[0]?.op).toBe('delete')
        expect(calls[0]?.filters).toEqual([
            ['id', ID],
            ['user_id', 'user-1'],
            ['result_time_s', null],
        ])
    })

    it("returns false for another user's id", async () => {
        const { supabase } = twoUsersDb()

        expect(await Effect.runPromise(deleteRace(supabase, 'user-1', OTHER_ID))).toBe(false)
    })

    it('fails with RaceQueryError on a returned error', async () => {
        const { supabase } = makeFakeAdminDb(() => DENIED)

        expect(failureTag(await Effect.runPromiseExit(deleteRace(supabase, 'user-1', ID)))).toBe(
            'RaceQueryError'
        )
    })
})
