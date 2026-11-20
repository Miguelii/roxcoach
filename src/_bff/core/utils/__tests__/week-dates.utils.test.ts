import { describe, expect, it } from 'vitest'
import { addDays, isoWeekday, startOfWeek } from '@/_bff/core/utils/week-dates.utils'

describe('week-dates', () => {
    it('finds the Monday of a week', () => {
        expect(startOfWeek('2026-11-19')).toBe('2026-11-16')
        expect(startOfWeek('2026-11-22')).toBe('2026-11-16')
    })

    it('returns ISO weekdays with Sunday as 7', () => {
        expect(isoWeekday('2026-11-19')).toBe(4)
        expect(isoWeekday('2026-11-22')).toBe(7)
    })

    it('adds days across boundaries', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    })
})
