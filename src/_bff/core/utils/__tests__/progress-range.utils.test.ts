import { describe, expect, it } from 'vitest'
import { PROGRESS_RANGES } from '@/_bff/core/constants/progress.constants'
import { bucketStartOf, bucketStarts, rangeBounds } from '@/_bff/core/utils/progress-range.utils'

describe('rangeBounds', () => {
    it('starts 3m on the Monday 12 weeks before the current week', () => {
        expect(rangeBounds('2026-11-20', '3m')).toEqual({ from: '2026-08-24', granularity: 'week' })
    })

    it('starts 6m 25 weeks before the current week', () => {
        expect(rangeBounds('2026-11-20', '6m')).toEqual({ from: '2026-05-25', granularity: 'week' })
    })

    it('starts 12m on the Monday 51 weeks before the current week', () => {
        expect(rangeBounds('2026-11-20', '12m')).toEqual({
            from: '2025-11-24',
            granularity: 'week',
        })
    })
})

describe('PROGRESS_RANGES', () => {
    it('lists the supported ranges and every one has bounds ending at today', () => {
        expect(PROGRESS_RANGES).toEqual(['3m', '6m', '12m'])
        for (const range of PROGRESS_RANGES) {
            const { from, granularity } = rangeBounds('2026-11-20', range)
            expect(bucketStarts(from, '2026-11-20', granularity).at(-1)).toBe(
                bucketStartOf('2026-11-20', granularity)
            )
        }
    })
})

describe('bucketStartOf', () => {
    it('puts Sunday and Monday in different weeks', () => {
        expect(bucketStartOf('2026-11-22', 'week')).toBe('2026-11-16')
        expect(bucketStartOf('2026-11-23', 'week')).toBe('2026-11-23')
    })

    it('uses the first of the month for months', () => {
        expect(bucketStartOf('2026-11-20', 'month')).toBe('2026-11-01')
    })
})

describe('bucketStarts', () => {
    it('lists 13 weekly buckets ending with the current week', () => {
        const { from } = rangeBounds('2026-11-20', '3m')
        const starts = bucketStarts(from, '2026-11-20', 'week')
        expect(starts).toHaveLength(13)
        expect(starts.at(-1)).toBe('2026-11-16')
        expect(starts[1]).toBe('2026-08-31')
    })

    it('lists 12 monthly buckets without gaps across a year boundary', () => {
        const starts = bucketStarts('2025-12-01', '2026-11-20', 'month')
        expect(starts).toHaveLength(12)
        expect(starts[0]).toBe('2025-12-01')
        expect(starts[1]).toBe('2026-01-01')
        expect(starts.at(-1)).toBe('2026-11-01')
    })
})
