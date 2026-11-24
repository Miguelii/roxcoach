// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Cause, Effect, Exit, Option } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb } from '@/_bff/lib/fake-bd'
import { getCalendar } from '@/_bff/modules/training/services/get-calendar.service'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User

const DB_ROW = {
    id: '7a1f0f4e-3b0e-4c53-9a0a-6a3a3d2f9c11',
    source: 'manual',
    category: 'run',
    name: 'Morning run',
    started_at: '2026-11-18T07:30:00+00:00',
    local_date: '2026-11-18',
    distance_m: 10000,
    moving_time_s: 3000,
    elapsed_time_s: 3100,
    elevation_gain_m: null,
    avg_hr: null,
    max_hr: null,
    avg_speed_mps: null,
    calories: null,
    body_weight_kg: null,
    lyfta_total_volume_kg_reps: null,
    perceived_effort: null,
    notes: null,
}

const RACE_ROW = {
    id: 'race-1',
    name: 'Hyrox Lisbon',
    race_type: 'hyrox',
    race_date: '2026-11-17',
    location: null,
    distance_m: null,
    hyrox_division: 'open_men',
    target_time_s: 4200,
    priority: 'A',
    status: 'upcoming',
    result_time_s: null,
    notes: null,
}

const run = (from: string, to: string) => Effect.runPromiseExit(getCalendar(USER, { from, to }))

describe('getCalendar', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('reads the range as the signed-in user and returns one calendar item per activity', async () => {
        const { chains, supabase } = makeFakeDb([
            { data: [DB_ROW], error: null },
            { data: [], error: null },
        ])
        createDBServerClientMock.mockResolvedValue(supabase)

        const items = await Effect.runPromise(
            getCalendar(USER, { from: '2026-11-16', to: '2026-11-22' })
        )

        expect(items).toHaveLength(1)
        expect(items[0]?.type).toBe('activity')
        expect(items[0]?.date).toBe('2026-11-18')
        const first = items[0]
        expect(first?.type === 'activity' && first.activity.id).toBe(DB_ROW.id)
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
        expect(chains[0]?.gte).toHaveBeenCalledWith('local_date', '2026-11-16')
        expect(chains[0]?.lte).toHaveBeenCalledWith('local_date', '2026-11-22')
    })

    it('merges activities and races ordered by date and reads races as the user', async () => {
        const { chains, supabase } = makeFakeDb([
            { data: [DB_ROW], error: null },
            {
                data: [RACE_ROW, { ...RACE_ROW, id: 'race-2', race_date: '2026-11-19' }],
                error: null,
            },
        ])
        createDBServerClientMock.mockResolvedValue(supabase)

        const items = await Effect.runPromise(
            getCalendar(USER, { from: '2026-11-16', to: '2026-11-22' })
        )

        expect(items.map((item) => item.type)).toEqual(['race', 'activity', 'race'])
        expect(items.map((item) => item.date)).toEqual(['2026-11-17', '2026-11-18', '2026-11-19'])
        const race = items[0]
        expect(race?.type === 'race' && race.race).toEqual({
            id: 'race-1',
            name: 'Hyrox Lisbon',
            raceType: 'hyrox',
            raceDate: '2026-11-17',
            targetTimeS: 4200,
            priority: 'A',
            status: 'upcoming',
        })
        expect(chains[1]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
        expect(chains[1]?.in).toHaveBeenCalledWith('status', ['upcoming', 'completed'])
        expect(chains[1]?.gte).toHaveBeenCalledWith('race_date', '2026-11-16')
        expect(chains[1]?.lte).toHaveBeenCalledWith('race_date', '2026-11-22')
    })

    it('fails with RaceQueryError when the races read fails', async () => {
        const { supabase } = makeFakeDb([{ data: [], error: null }, new Error('boom')])
        createDBServerClientMock.mockResolvedValue(supabase)

        expect(failureTag(await run('2026-11-16', '2026-11-22'))).toBe('RaceQueryError')
    })

    it('accepts a single-day range and a span of exactly 100 days', async () => {
        const { supabase } = makeFakeDb([{ data: [], error: null }])
        createDBServerClientMock.mockResolvedValue(supabase)

        expect(Exit.isSuccess(await run('2026-11-18', '2026-11-18'))).toBe(true)
        expect(Exit.isSuccess(await run('2026-01-01', '2026-04-11'))).toBe(true)
    })

    it('rejects an inverted range with InvalidDateRangeError before touching the database', async () => {
        const exit = await run('2026-11-22', '2026-11-16')

        expect(failureTag(exit)).toBe('InvalidDateRangeError')
        expect(createDBServerClientMock).not.toHaveBeenCalled()
    })

    it('rejects a span longer than 100 days', async () => {
        const exit = await run('2026-01-01', '2026-04-12')

        expect(failureTag(exit)).toBe('InvalidDateRangeError')
        expect(createDBServerClientMock).not.toHaveBeenCalled()
    })

    it('measures the span in calendar days across a leap day and a DST change', async () => {
        const { supabase } = makeFakeDb([{ data: [], error: null }])
        createDBServerClientMock.mockResolvedValue(supabase)

        expect(Exit.isSuccess(await run('2028-01-01', '2028-04-10'))).toBe(true)
        expect(failureTag(await run('2028-01-01', '2028-04-11'))).toBe('InvalidDateRangeError')
        expect(Exit.isSuccess(await run('2026-03-01', '2026-06-09'))).toBe(true)
    })

    it('rejects a malformed date', async () => {
        expect(failureTag(await run('2026-11-1', '2026-11-22'))).toBe('InvalidDateRangeError')
        expect(failureTag(await run('2026-11-16', 'tomorrow'))).toBe('InvalidDateRangeError')
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no cookies'))

        const exit = await run('2026-11-16', '2026-11-22')

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })

    it('fails with ActivityQueryError when the read fails', async () => {
        const { supabase } = makeFakeDb([new Error('boom')])
        createDBServerClientMock.mockResolvedValue(supabase)

        const exit = await run('2026-11-16', '2026-11-22')

        expect(failureTag(exit)).toBe('ActivityQueryError')
        if (Exit.isFailure(exit))
            expect(Option.isSome(Cause.findErrorOption(exit.cause))).toBe(true)
    })
})
