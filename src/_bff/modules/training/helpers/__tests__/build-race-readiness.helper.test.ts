/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it } from 'vitest'
import type { HrZoneBounds } from '@/_bff/core/constants/hr-zones.constants'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { buildRaceReadiness } from '@/_bff/modules/training/helpers/build-race-readiness.helper'

const BOUNDS: HrZoneBounds[] = [
    { zone: 1, fromBpm: 0, toBpm: 119 },
    { zone: 2, fromBpm: 120, toBpm: 139 },
    { zone: 3, fromBpm: 140, toBpm: 159 },
    { zone: 4, fromBpm: 160, toBpm: 179 },
    { zone: 5, fromBpm: 180, toBpm: null },
]

const TODAY = '2026-11-21'

// Hyrox at 1:30:00, so the race pace is 355 s/km.
const HYROX: RaceDTO = {
    id: 'r1',
    name: 'Hyrox Lisbon',
    raceType: 'hyrox',
    raceDate: '2027-01-10',
    location: null,
    distanceM: null,
    hyroxDivision: null,
    targetTimeS: 5400,
    priority: 'A',
    status: 'upcoming',
    resultTimeS: null,
    notes: null,
}

const day = (daysAgo: number) =>
    new Date(Date.parse(`${TODAY}T00:00:00Z`) - daysAgo * 86_400_000).toISOString().slice(0, 10)

type RunOverrides = {
    daysAgo: number
    km?: number
    hr?: [number, number][]
    pace?: [number, number][] | null
}

const run = ({ daysAgo, km = 10, hr = [], pace = null }: RunOverrides) => ({
    localDate: day(daysAgo),
    distanceM: km * 1000,
    hrHistogram: {
        v: 1 as const,
        bins: hr.map(([bpm, timeS]): [number, number, number] => [bpm, timeS, 0]),
    },
    paceHistogram:
        pace === null
            ? null
            : {
                  v: 1 as const,
                  bins: pace.map(([p, timeS]): [number, number, number] => [p, timeS, 0]),
              },
})

const steadyWeeks = (hr: [number, number][] = [[130, 3000]]) =>
    [2, 9, 16, 23, 30, 37].map((daysAgo) => run({ daysAgo, hr }))

const build = (
    runs: ReturnType<typeof run>[],
    overrides: Partial<Parameters<typeof buildRaceReadiness>[0]> = {}
) => buildRaceReadiness({ runs, today: TODAY, zoneBounds: BOUNDS, race: HYROX, ...overrides })

describe('buildRaceReadiness', () => {
    it('returns null without a race or without a race pace', () => {
        expect(build([], { race: null })).toBeNull()
        expect(build([], { race: { ...HYROX, raceType: 'other' } })).toBeNull()
    })

    it('reports no data on both rows without runs, never attention', () => {
        const result = build([])!
        expect(result.load.state).toBe('no_data')
        expect(result.pace.state).toBe('no_data')
        expect(result.race.racePaceSPerKm).toBe(355)
        expect(result.race.daysLeft).toBe(50)
    })

    it('rates a steady, mostly easy load as on track', () => {
        const { load } = build(steadyWeeks())!
        expect(load.state).toBe('on_track')
        expect(load.weeklyKm).toBeCloseTo(10)
        expect(load.easySharePct).toBe(100)
    })

    it('flags a load that ramps too fast', () => {
        const runs = [
            ...steadyWeeks().slice(1),
            run({ daysAgo: 1, km: 30 }),
            run({ daysAgo: 3, km: 30 }),
        ]
        const { load } = build(runs)!
        expect(load.ratio).toBeGreaterThan(1.3)
        expect(load.state).toBe('attention')
    })

    it('flags too little easy running', () => {
        const { load } = build(steadyWeeks([[170, 3000]]))!
        expect(load.easySharePct).toBe(0)
        expect(load.state).toBe('attention')
    })

    it('judges the ratio only when there are no zone bounds', () => {
        const { load } = build(steadyWeeks([[170, 3000]]), { zoneBounds: null })!
        expect(load.easySharePct).toBeNull()
        expect(load.state).toBe('on_track')
    })

    it('rates the pace on track with 3 fast sessions', () => {
        const fast = (daysAgo: number) =>
            run({
                daysAgo,
                pace: [
                    [300, 200],
                    [400, 600],
                ],
            })
        const { pace } = build([fast(2), fast(6), fast(10)])!
        expect(pace).toEqual({ state: 'on_track', fastSessions: 3, fastTimeS: 600 })
    })

    it('flags the pace with 2 fast sessions and ignores a bin that straddles the race pace', () => {
        const fast = (daysAgo: number) => run({ daysAgo, pace: [[300, 200]] })
        const straddle = run({ daysAgo: 12, pace: [[353, 900]] })
        const { pace } = build([fast(2), fast(6), straddle])!
        expect(pace.fastSessions).toBe(2)
        expect(pace.state).toBe('attention')
    })

    it('reports no data for the pace when no run has a pace histogram', () => {
        expect(build(steadyWeeks())!.pace.state).toBe('no_data')
    })

    it('turns the verdicts neutral in the taper and keeps no data', () => {
        const taperRace = { ...HYROX, raceDate: day(-5) }
        const fast = (daysAgo: number) => run({ daysAgo, pace: [[300, 200]] })
        const result = build([...steadyWeeks(), fast(2)], { race: taperRace })!
        expect(result.race.daysLeft).toBe(5)
        expect(result.load.state).toBe('taper')
        expect(result.pace.state).toBe('taper')
        expect(build([], { race: taperRace })!.load.state).toBe('no_data')
    })

    it('handles a race today', () => {
        const result = build(steadyWeeks(), { race: { ...HYROX, raceDate: TODAY } })!
        expect(result.race.daysLeft).toBe(0)
        expect(result.load.state).toBe('taper')
    })
})
