import { describe, expect, it } from 'vitest'
import {
    addDays,
    addMonths,
    daysBetween,
    isoWeekNumber,
    isoWeekday,
    monthGrid,
    startOfWeek,
} from '@/modules/calendar/date-utils'

describe('date-utils', () => {
    it('finds the Monday of a week', () => {
        expect(startOfWeek('2026-11-19')).toBe('2026-11-16')
        expect(startOfWeek('2026-11-22')).toBe('2026-11-16')
    })

    it('returns ISO weekdays with Sunday as 7', () => {
        expect(isoWeekday('2026-11-19')).toBe(4)
        expect(isoWeekday('2026-11-22')).toBe(7)
    })

    it('computes ISO week numbers', () => {
        expect(isoWeekNumber('2026-11-19')).toBe(47)
        expect(isoWeekNumber('2026-01-01')).toBe(1)
    })

    it('adds days and months across boundaries', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
        expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
        expect(daysBetween('2026-11-19', '2026-12-31')).toBe(42)
    })

    it('builds Monday-first month grids that cover the whole month', () => {
        const weeks = monthGrid('2026-11-19')

        expect(weeks.every((week) => week.length === 7)).toBe(true)
        expect(weeks[0]?.[0]).toBe('2026-10-26')
        expect(weeks.flat()).toContain('2026-11-30')
    })
})
