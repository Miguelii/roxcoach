import { describe, expect, it } from 'vitest'
import type { HrZoneBounds } from '@/_bff/core/constants/hr-zones.constants'
import { buildRunProgress } from '@/_bff/modules/training/helpers/build-run-progress.helper'
import type { RaceDTO } from '@/_bff/modules/races/types'

const BOUNDS: HrZoneBounds[] = [
    { zone: 1, fromBpm: 0, toBpm: 119 },
    { zone: 2, fromBpm: 120, toBpm: 139 },
    { zone: 3, fromBpm: 140, toBpm: 159 },
    { zone: 4, fromBpm: 160, toBpm: 179 },
    { zone: 5, fromBpm: 180, toBpm: null },
]

const TODAY = '2026-11-20'

const run = (
    localDate: string,
    distanceM: number | null,
    movingTimeS: number | null,
    bins: [number, number, number][] | null = null,
    avgHr: number | null = null
) => ({
    localDate,
    distanceM,
    movingTimeS,
    avgHr,
    hrHistogram: bins === null ? null : { v: 1 as const, bins },
    paceHistogram: null,
})

const base = {
    today: TODAY,
    range: '3m' as const,
    zoneBounds: BOUNDS,
    goalRace: null,
    nextRace: null,
}

const goalRace: RaceDTO = {
    id: 'g',
    name: 'City 10K',
    raceType: 'running',
    raceDate: '2026-12-20',
    location: null,
    distanceM: 10_000,
    hyroxDivision: null,
    targetTimeS: 3000,
    priority: 'A',
    status: 'upcoming',
    resultTimeS: null,
    notes: null,
}

describe('buildRunProgress buckets', () => {
    it('creates every bucket, empty ones with null pace', () => {
        const dto = buildRunProgress({ ...base, runs: [] })
        expect(dto.buckets).toHaveLength(13)
        expect(dto.buckets[0]).toMatchObject({ paceSecPerKm: null, distanceKm: 0, runs: 0 })
        expect(dto.buckets[0]?.zones).toHaveLength(5)
        expect(dto.kpis).toMatchObject({ avgPaceSecPerKm: null, runs: 0, recentPaceSecPerKm: null })
    })

    it('computes pace as moving time over distance and shares same-date buckets', () => {
        const dto = buildRunProgress({
            ...base,
            runs: [run('2026-11-16', 5000, 1500), run('2026-11-16', 5000, 1600)],
        })
        const last = dto.buckets.at(-1)
        expect(last?.paceSecPerKm).toBe(310)
        expect(last?.distanceKm).toBe(10)
        expect(last?.movingTimeS).toBe(3100)
        expect(last?.runs).toBe(2)
    })

    it('leaves out zero distance or null moving time without dividing by zero', () => {
        const dto = buildRunProgress({
            ...base,
            runs: [
                run('2026-11-16', 0, 600),
                run('2026-11-16', 5000, null),
                run('2026-11-17', 5000, 1500),
            ],
        })
        const last = dto.buckets.at(-1)
        expect(last?.runs).toBe(1)
        expect(last?.paceSecPerKm).toBe(300)
    })

    it('puts Sunday and Monday runs in different buckets', () => {
        const dto = buildRunProgress({
            ...base,
            runs: [run('2026-11-15', 1000, 300), run('2026-11-16', 1000, 360)],
        })
        expect(dto.buckets.at(-2)?.paceSecPerKm).toBe(300)
        expect(dto.buckets.at(-1)?.paceSecPerKm).toBe(360)
    })

    it('uses 52 weekly buckets for 12m', () => {
        const dto = buildRunProgress({
            ...base,
            range: '12m',
            runs: [run('2026-11-02', 1000, 300)],
        })
        expect(dto.granularity).toBe('week')
        expect(dto.buckets).toHaveLength(52)
        expect(dto.buckets.at(-1)?.start).toBe('2026-11-16')
    })
})

describe('buildRunProgress zones', () => {
    it('reports a pace only for zones with at least 300 s, minutes always', () => {
        const dto = buildRunProgress({
            ...base,
            runs: [
                run('2026-11-16', 1500, 520, [
                    [130, 400, 1200],
                    [150, 120, 300],
                ]),
            ],
        })
        const zones = dto.buckets.at(-1)?.zones
        expect(zones?.[1]?.paceSecPerKm).toBeCloseTo(333.33, 1)
        expect(zones?.[1]?.minutes).toBeCloseTo(6.67, 1)
        expect(zones?.[2]).toEqual({ zone: 3, paceSecPerKm: null, minutes: 2 })
        expect(dto.hasZoneData).toBe(true)
    })

    it('gives no zone data without bounds', () => {
        const dto = buildRunProgress({
            ...base,
            zoneBounds: null,
            runs: [run('2026-11-16', 1500, 520, [[130, 400, 1200]])],
        })
        expect(dto.hasZoneData).toBe(false)
        expect(dto.buckets.every((b) => b.zones.every((z) => z.paceSecPerKm === null))).toBe(true)
    })

    it('counts a null histogram only in pace and survives zero-distance histograms', () => {
        const dto = buildRunProgress({
            ...base,
            runs: [run('2026-11-16', 1000, 300), run('2026-11-16', 0, 300, [[130, 400, 0]])],
        })
        expect(dto.hasZoneData).toBe(false)
        expect(dto.buckets.at(-1)?.paceSecPerKm).toBe(300)
    })
})

describe('buildRunProgress kpis and goal', () => {
    it('aggregates the range and uses the last bucket with data as recent pace', () => {
        const dto = buildRunProgress({
            ...base,
            goalRace,
            runs: [run('2026-10-05', 10_000, 3300), run('2026-11-02', 5000, 1500)],
        })
        expect(dto.kpis.runs).toBe(2)
        expect(dto.kpis.distanceKm).toBe(15)
        expect(dto.kpis.avgPaceSecPerKm).toBe(320)
        expect(dto.kpis.recentPaceSecPerKm).toBe(300)
        expect(dto.goal).toEqual({
            raceId: 'g',
            name: 'City 10K',
            raceDate: '2026-12-20',
            daysLeft: 30,
            distanceM: 10_000,
            targetTimeS: 3000,
            paceSecPerKm: 300,
        })
        expect(dto.kpis.goalDeltaSecPerKm).toBe(0)
    })

    it('gives a positive delta when slower than the goal and null without goal', () => {
        const runs = [run('2026-11-16', 1000, 330)]
        expect(buildRunProgress({ ...base, goalRace, runs }).kpis.goalDeltaSecPerKm).toBe(30)
        expect(buildRunProgress({ ...base, runs }).kpis.goalDeltaSecPerKm).toBeNull()
    })

    it('clamps daysLeft at zero', () => {
        const dto = buildRunProgress({
            ...base,
            runs: [],
            goalRace: { ...goalRace, raceDate: '2026-11-01' },
        })
        expect(dto.goal?.daysLeft).toBe(0)
    })
})

describe('buildRunProgress heart rate', () => {
    it('averages the heart rate of the bucket weighted by moving time', () => {
        const dto = buildRunProgress({
            ...base,
            runs: [
                run('2026-11-16', 5000, 1500, null, 150),
                run('2026-11-17', 10_000, 3000, null, 160),
            ],
        })

        // (150 * 1500 + 160 * 3000) / 4500
        expect(dto.buckets.at(-1)?.avgHrBpm).toBe(157)
    })

    it('has no average without a heart rate and ignores runs that are left out of the pace', () => {
        const dto = buildRunProgress({
            ...base,
            runs: [run('2026-11-16', 5000, 1500), run('2026-11-17', 0, 600, null, 170)],
        })

        expect(dto.buckets.at(-1)?.avgHrBpm).toBeNull()
        expect(dto.buckets[0]?.avgHrBpm).toBeNull()
    })
})

describe('buildRunProgress readiness', () => {
    const hyrox: RaceDTO = {
        id: 'h1',
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

    it('adds the readiness of the next race with the Hyrox race pace', () => {
        const dto = buildRunProgress({
            ...base,
            nextRace: hyrox,
            runs: [run('2026-11-16', 5000, 1500)],
        })
        expect(dto.readiness?.race.racePaceSPerKm).toBe(355)
        expect(dto.readiness?.race.name).toBe('Hyrox Lisbon')
    })

    it('has no readiness without a next race', () => {
        expect(buildRunProgress({ ...base, runs: [] }).readiness).toBeNull()
    })
})
