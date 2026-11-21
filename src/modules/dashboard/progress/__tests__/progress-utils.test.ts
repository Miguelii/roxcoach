import { describe, expect, it } from 'vitest'
import type { RunBucketDTO } from '@/_bff/modules/training/types/progress'
import {
    bucketLabel,
    bucketRangeLabel,
    exerciseInsights,
    dayLabel,
    daysLeftLabel,
    paceSummary,
    rangeLabel,
} from '@/modules/dashboard/progress/progress-utils'

const bucket = (start: string, paceSecPerKm: number | null): RunBucketDTO => ({
    start,
    paceSecPerKm,
    distanceKm: 0,
    movingTimeS: 0,
    runs: 0,
    avgHrBpm: null,
    zones: [],
})

describe('bucketLabel', () => {
    it('labels a week by its first day and a month by month and year', () => {
        expect(bucketLabel('2026-11-16', 'week')).toBe('16 Nov')
        expect(bucketLabel('2026-11-01', 'month')).toBe('Nov 26')
    })
})

describe('dayLabel', () => {
    it('labels a date with its weekday', () => {
        expect(dayLabel('2026-11-18')).toBe('Wed 18 Nov')
    })
})

describe('rangeLabel', () => {
    it('spells the range in months', () => {
        expect(rangeLabel('3m')).toBe('3 months')
        expect(rangeLabel('12m')).toBe('12 months')
    })
})

describe('daysLeftLabel', () => {
    it.each([
        [0, 'today'],
        [-2, 'today'],
        [1, 'tomorrow'],
        [23, 'in 23 days'],
    ])('says %d days as "%s"', (days, text) => {
        expect(daysLeftLabel(days)).toBe(text)
    })
})

describe('paceSummary', () => {
    it('says the pace improved when it fell', () => {
        const buckets = [bucket('a', 330), bucket('b', null), bucket('c', 312)]
        expect(paceSummary(buckets, '6m')).toBe(
            'Average pace improved from 5:30 /km to 5:12 /km over 6 months.'
        )
    })

    it('says the pace slowed when it rose', () => {
        expect(paceSummary([bucket('a', 300), bucket('b', 320)], '3m')).toBe(
            'Average pace slowed from 5:00 /km to 5:20 /km over 3 months.'
        )
    })

    it('says it held steady within a few seconds', () => {
        expect(paceSummary([bucket('a', 300), bucket('b', 302)], '3m')).toBe(
            'Average pace held steady near 5:02 /km over 3 months.'
        )
    })

    it('handles a single point and no data', () => {
        expect(paceSummary([bucket('a', 300)], '3m')).toBe('Average pace 5:00 /km.')
        expect(paceSummary([bucket('a', null)], '3m')).toBe('No pace data in this range.')
    })
})

describe('bucketRangeLabel', () => {
    it('names a week by its number and its days, naming the month once', () => {
        expect(bucketRangeLabel('2026-11-16', 'week')).toBe('Week 47 · 16 to 22 Nov')
    })

    it('names both months when the week crosses a month', () => {
        expect(bucketRangeLabel('2026-11-30', 'week')).toBe('Week 49 · 30 Nov to 6 Dec')
    })

    it('names a month with its year', () => {
        expect(bucketRangeLabel('2026-11-01', 'month')).toBe('November 2026')
    })
})

describe('exerciseInsights', () => {
    const point = (date: string, topSetKg: number, topSetReps: number) => ({
        date,
        topSetKg,
        topSetReps,
    })

    it('needs at least two workouts', () => {
        expect(exerciseInsights([])).toBeNull()
        expect(exerciseInsights([point('2026-10-05', 40, 8)])).toBeNull()
    })

    it('reports progress when the estimated 1RM rose, with the load, reps and 1RM changes', () => {
        const insights = exerciseInsights([
            point('2026-10-05', 40, 8),
            point('2026-10-19', 45, 6),
            point('2026-11-02', 50, 6),
        ])

        expect(insights).toMatchObject({
            verdict: 'progressing',
            loadDeltaKg: 10,
            repsDelta: -2,
            firstDate: '2026-10-05',
            bestWorkoutsAgo: 0,
        })
        // 40 x 8 estimates 50.7 and 50 x 6 estimates 60.
        expect(insights?.e1rmDeltaKg).toBeCloseTo(9.3, 1)
    })

    it('reports steady inside 2% and slipping below it, and how long ago the best was', () => {
        expect(
            exerciseInsights([point('2026-10-05', 40, 8), point('2026-11-02', 40, 8)])?.verdict
        ).toBe('steady')

        const slipping = exerciseInsights([
            point('2026-10-05', 50, 8),
            point('2026-10-19', 40, 8),
            point('2026-11-02', 40, 6),
        ])
        expect(slipping).toMatchObject({ verdict: 'declining', bestWorkoutsAgo: 2 })
    })

    it('has no verdict or 1RM when a set is above 12 reps', () => {
        const insights = exerciseInsights([
            point('2026-10-05', 20, 15),
            point('2026-11-02', 25, 15),
        ])

        expect(insights).toMatchObject({ verdict: null, e1rmDeltaKg: null, bestWorkoutsAgo: null })
        expect(insights?.loadDeltaKg).toBe(5)
    })
})
