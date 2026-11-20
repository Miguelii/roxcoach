import { describe, expect, it } from 'vitest'
import {
    formatClock,
    formatDuration,
    formatKm,
    formatPace,
    parseClock,
} from '@/_bff/core/utils/formatters.utils'

describe('formatDuration', () => {
    it('formats hours, minutes and seconds', () => {
        expect(formatDuration(3900)).toBe('1h 05m')
        expect(formatDuration(2700)).toBe('45m')
        expect(formatDuration(38)).toBe('38s')
    })

    it('returns null for missing values', () => {
        expect(formatDuration(null)).toBeNull()
    })
})

describe('formatClock', () => {
    it('formats with and without hours', () => {
        expect(formatClock(4200)).toBe('1:10:00')
        expect(formatClock(2399)).toBe('39:59')
    })
})

describe('formatPace', () => {
    it('converts m/s to min per km', () => {
        expect(formatPace(1000 / 295)).toBe('4:55 /km')
    })

    it('returns null for zero or missing speed', () => {
        expect(formatPace(0)).toBeNull()
        expect(formatPace(null)).toBeNull()
    })
})

describe('formatKm', () => {
    it('formats meters with one decimal', () => {
        expect(formatKm(10240)).toBe('10.2 km')
        expect(formatKm(null)).toBeNull()
    })
})

describe('parseClock', () => {
    it('parses h:mm:ss, mm:ss and plain minutes', () => {
        expect(parseClock('1:10:00')).toBe(4200)
        expect(parseClock('39:59')).toBe(2399)
        expect(parseClock('45')).toBe(2700)
    })

    it('rejects invalid text and seconds above 59', () => {
        expect(parseClock('abc')).toBeNull()
        expect(parseClock('10:75')).toBeNull()
        expect(parseClock('1:75:00')).toBeNull()
        expect(parseClock('90:00')).toBe(5400)
    })
})
