// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import { getRunProgress } from '@/_bff/modules/training/services/get-run-progress.service'
import { getStrengthProgress } from '@/_bff/modules/training/services/get-strength-progress.service'
import type { RaceDTO, RaceFilter } from '@/_bff/modules/races/types'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User

// SAFETY: the fake only carries rows through; a jsonb column is not a flat FakeRow value.
const okRows = (rows: unknown[]) => ok(rows as never)

const PROFILE: ProfileDTO = {
    displayName: 'A',
    timezone: 'Europe/Lisbon',
    maxHr: 190,
    restingHr: 50,
    hyroxDivision: null,
    weeklyHoursCap: null,
    notes: null,
    dashboardMode: 'run',
}

// SAFETY: only the fields pickGoalRace and buildGoal read are set.
const RACE = {
    id: 'race-1',
    name: '10K',
    raceType: 'running',
    raceDate: '2026-12-01',
    distanceM: 10000,
    targetTimeS: 3000,
    priority: 'A',
    status: 'upcoming',
} as RaceDTO

const runDeps = (
    supabase: ReturnType<typeof makeFakeDb>['supabase'],
    overrides: { profile?: ProfileDTO; races?: RaceDTO[]; timezone?: string } = {}
) => {
    const filters: RaceFilter[] = []
    return {
        filters,
        deps: {
            createClient: () => Effect.succeed(supabase),
            getTimezone: () => Effect.succeed(overrides.timezone ?? 'Europe/Lisbon'),
            getProfile: () => Effect.succeed(overrides.profile ?? PROFILE),
            listRaces: (_user: User, filter: RaceFilter) => {
                filters.push(filter)
                return Effect.succeed(overrides.races ?? [])
            },
            now: () => new Date('2026-11-21T12:00:00Z'),
        },
    }
}

describe('getRunProgress', () => {
    it('bounds the query by the range in the athlete timezone and builds zones and goal', async () => {
        const { chains, supabase } = makeFakeDb([
            okRows([
                {
                    local_date: '2026-11-10',
                    distance_m: 10000,
                    moving_time_s: 3000,
                    hr_histogram: { v: 1, bins: [[150, 600, 2000]] },
                },
            ]),
        ])
        const { deps, filters } = runDeps(supabase, { races: [RACE], timezone: 'Pacific/Auckland' })
        const dto = await Effect.runPromise(getRunProgress(USER, '3m', deps))

        // 2026-11-21T12:00Z is already 2026-11-22 in Auckland.
        expect(chains[0]?.lte).toHaveBeenCalledWith('local_date', '2026-11-22')
        expect(chains[0]?.gte).toHaveBeenCalledWith('local_date', expect.any(String))
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
        expect(filters).toEqual([{ status: ['upcoming'] }])
        expect(dto.range).toBe('3m')
        expect(dto.zoneBounds).not.toBeNull()
        expect(dto.goal?.raceId).toBe('race-1')
        expect(dto.kpis.runs).toBe(1)
    })

    it('has no zone bounds when the heart rates are missing or inverted', async () => {
        const missing = makeFakeDb([okRows([])])
        const a = await Effect.runPromise(
            getRunProgress(
                USER,
                '3m',
                runDeps(missing.supabase, { profile: { ...PROFILE, maxHr: null } }).deps
            )
        )
        const inverted = makeFakeDb([okRows([])])
        const b = await Effect.runPromise(
            getRunProgress(
                USER,
                '3m',
                runDeps(inverted.supabase, { profile: { ...PROFILE, maxHr: 50, restingHr: 190 } })
                    .deps
            )
        )

        expect(a.zoneBounds).toBeNull()
        expect(b.zoneBounds).toBeNull()
    })

    it('returns empty series, not an error, for an empty history', async () => {
        const { supabase } = makeFakeDb([okRows([])])
        const dto = await Effect.runPromise(getRunProgress(USER, '6m', runDeps(supabase).deps))

        expect(dto.kpis.runs).toBe(0)
        expect(dto.goal).toBeNull()
        expect(dto.buckets.every((bucket) => bucket.runs === 0)).toBe(true)
    })
})

describe('getStrengthProgress', () => {
    const strengthDeps = (supabase: ReturnType<typeof makeFakeDb>['supabase']) => ({
        createClient: () => Effect.succeed(supabase),
        getTimezone: () => Effect.succeed('Europe/Lisbon'),
        now: () => new Date('2026-11-21T12:00:00Z'),
    })

    it('returns top exercises and body weight', async () => {
        const { chains, supabase } = makeFakeDb([
            okRows([{ id: 'w1', local_date: '2026-11-10', body_weight_kg: 82 }]),
            okRows([
                {
                    activity_id: 'w1',
                    exercise: 'Squat',
                    source_exercise_id: '7',
                    reps: 5,
                    load_kg: 100,
                },
            ]),
        ])
        const dto = await Effect.runPromise(getStrengthProgress(USER, '3m', strengthDeps(supabase)))

        expect(chains[0]?.lte).toHaveBeenCalledWith('local_date', '2026-11-21')
        expect(chains[1]?.in).toHaveBeenCalledWith('activity_id', ['w1'])
        expect(dto.bodyWeight).toEqual([{ date: '2026-11-10', kg: 82 }])
        expect(dto.exercises.map((exercise) => exercise.name)).toEqual(['Squat'])
    })

    it('returns empty series for an empty history without querying sets', async () => {
        const { from, supabase } = makeFakeDb([okRows([])])
        const dto = await Effect.runPromise(
            getStrengthProgress(USER, '12m', strengthDeps(supabase))
        )

        expect(from).toHaveBeenCalledTimes(1)
        expect(dto.exercises).toEqual([])
        expect(dto.bodyWeight).toEqual([])
    })
})
