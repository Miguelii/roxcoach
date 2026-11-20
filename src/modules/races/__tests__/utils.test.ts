import { describe, expect, it } from 'vitest'
import { daysUntil, formatDaysToGo, formatDelta, formatRaceDate } from '@/modules/races/utils'

describe('race utils', () => {
    it('counts whole days between plain dates, across a DST change', () => {
        expect(daysUntil('2026-11-20', '2026-11-20')).toBe(0)
        expect(daysUntil('2026-11-20', '2027-01-01')).toBe(42)
        expect(daysUntil('2027-03-20', '2027-04-01')).toBe(12)
        expect(daysUntil('2026-11-20', '2026-11-19')).toBe(-1)
    })

    it('words the days to go', () => {
        expect(formatDaysToGo(42)).toBe('42 days to go')
        expect(formatDaysToGo(1)).toBe('1 day to go')
        expect(formatDaysToGo(0)).toBe('Today')
        expect(formatDaysToGo(-2)).toBe('2 days ago')
    })

    it('formats a date without the browser timezone', () => {
        expect(formatRaceDate('2027-03-06')).toBe('Sat, 6 Mar 2027')
    })

    it('compares a result with the goal', () => {
        expect(formatDelta(2400, 2502)).toBe('1:42 slower than goal')
        expect(formatDelta(2400, 2370)).toBe('0:30 faster than goal')
        expect(formatDelta(2400, 2400)).toBe('On goal')
        expect(formatDelta(2400, null)).toBeNull()
    })
})
