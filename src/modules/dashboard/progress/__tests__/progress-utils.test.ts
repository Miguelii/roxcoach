/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it } from 'vitest'
import type { RunBucketDTO } from '@/_bff/modules/training/types/progress'
import {
    bucketLabel,
    bucketRangeLabel,
    exerciseInsights,
    strengthSummary,
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
    const verdict = (first: [number, number], last: [number, number]) =>
        exerciseInsights([
            point('2026-10-05', first[0], first[1]),
            point('2026-11-02', last[0], last[1]),
        ])?.verdict

    it('needs at least two workouts', () => {
        expect(exerciseInsights([])).toBeNull()
        expect(exerciseInsights([point('2026-10-05', 40, 8)])).toBeNull()
    })

    it('is progress with more weight and the same reps, or the same weight and more reps', () => {
        expect(verdict([40, 8], [45, 8])).toBe('progressing')
        expect(verdict([40, 8], [40, 10])).toBe('progressing')
        expect(verdict([40, 8], [45, 10])).toBe('progressing')
    })

    it('is steady when nothing changed and slipping with less weight or fewer reps', () => {
        expect(verdict([40, 8], [40, 8])).toBe('steady')
        expect(verdict([40, 8], [35, 8])).toBe('declining')
        expect(verdict([40, 8], [40, 6])).toBe('declining')
    })

    it('is a trade when weight and reps move in opposite directions', () => {
        expect(verdict([40, 8], [45, 6])).toBe('mixed')
        expect(verdict([40, 8], [35, 10])).toBe('mixed')
    })

    it('reports the weight and reps change, the first date and when the heaviest set was', () => {
        const insights = exerciseInsights([
            point('2026-10-05', 40, 8),
            point('2026-10-19', 50, 6),
            point('2026-11-02', 45, 8),
        ])

        expect(insights).toMatchObject({
            verdict: 'progressing',
            loadDeltaKg: 5,
            repsDelta: 0,
            firstDate: '2026-10-05',
            heaviestWorkoutsAgo: 1,
        })
    })
})

describe('strengthSummary', () => {
    const lift = (
        name: string,
        points: [string, number, number][],
        imageUrl: string | null = null
    ) => ({
        key: name,
        name,
        imageUrl,
        workouts: points.length,
        points: points.map(([date, topSetKg, topSetReps]) => ({ date, topSetKg, topSetReps })),
    })

    const summary = strengthSummary([
        lift(
            'Press',
            [
                ['2026-10-05', 40, 8],
                ['2026-10-19', 45, 6],
                ['2026-11-02', 50, 8],
            ],
            'https://lyfta.app/images/exercises/press.png'
        ),
        lift(
            'Row',
            [
                ['2026-10-05', 50, 8],
                ['2026-10-19', 40, 8],
                ['2026-11-02', 40, 6],
            ],
            'https://lyfta.app/images/exercises/row.png'
        ),
        lift('Squat', [
            ['2026-10-05', 60, 5],
            ['2026-11-02', 70, 3],
        ]),
        lift('Curl', [['2026-11-02', 20, 10]]),
    ])

    it('counts the lifts by verdict, skipping lifts with one workout', () => {
        expect(summary).toMatchObject({
            rated: 3,
            progressing: 1,
            mixed: 1,
            steady: 0,
            declining: 1,
        })
        expect(summary.slipping).toEqual([
            { name: 'Row', imageUrl: 'https://lyfta.app/images/exercises/row.png' },
        ])
    })

    it('counts a record for each top set heavier than every earlier one, never the first', () => {
        // Press 45 and 50, Squat 70.
        expect(summary.records).toBe(3)
    })

    it('finds the heaviest top set (more reps wins a tie) and the biggest gain in weight', () => {
        expect(summary.heaviest).toEqual({
            name: 'Squat',
            imageUrl: null,
            topSetKg: 70,
            topSetReps: 3,
        })
        expect(summary.bestGain).toEqual({
            name: 'Press',
            loadDeltaKg: 10,
            imageUrl: 'https://lyfta.app/images/exercises/press.png',
        })
    })

    it('averages the change in top set reps over the rated lifts', () => {
        // Press 0, Row -2, Squat -2.
        expect(summary.avgRepsDelta).toBeCloseTo(-1.33, 1)
    })

    it('is empty without lifts to rate', () => {
        expect(strengthSummary([])).toMatchObject({
            rated: 0,
            records: 0,
            heaviest: null,
            avgRepsDelta: null,
            bestGain: null,
        })
    })
})
