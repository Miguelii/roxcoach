import { describe, expect, it } from 'vitest'
import type { RunBucketDTO } from '@/_bff/modules/training/types/progress'
import {
    bucketLabel,
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
