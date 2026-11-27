import { describe, expect, it } from 'vitest'
import {
    formatClock,
    formatDuration,
    formatKm,
    formatKmNumber,
    formatCompact,
    formatKg,
    formatPace,
    formatPaceSeconds,
    formatVolumeKg,
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

describe('formatKmNumber', () => {
    it('rounds to the given digits and strips trailing zeros', () => {
        expect(formatKmNumber(10240)).toBe('10.2')
        expect(formatKmNumber(10000)).toBe('10')
        expect(formatKmNumber(10250, 2)).toBe('10.25')
        expect(formatKmNumber(3500, 2)).toBe('3.5')
        expect(formatKmNumber(null)).toBeNull()
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

describe('formatPaceSeconds', () => {
    it('formats seconds per kilometer as a pace', () => {
        expect(formatPaceSeconds(295)).toBe('4:55 /km')
        expect(formatPaceSeconds(370)).toBe('6:10 /km')
    })

    it('returns null for missing or non-positive values', () => {
        expect(formatPaceSeconds(null)).toBeNull()
        expect(formatPaceSeconds(0)).toBeNull()
        expect(formatPaceSeconds(-5)).toBeNull()
    })
})

describe('formatKg', () => {
    it('keeps at most one decimal', () => {
        expect(formatKg(82.5)).toBe('82.5 kg')
        expect(formatKg(80)).toBe('80 kg')
        expect(formatKg(116.66)).toBe('116.7 kg')
    })

    it('returns null for a missing value', () => {
        expect(formatKg(null)).toBeNull()
    })
})

describe('formatVolumeKg', () => {
    it('adds a thousands separator and drops decimals', () => {
        expect(formatVolumeKg(12480.4)).toBe('12,480 kg')
        expect(formatVolumeKg(950)).toBe('950 kg')
        expect(formatVolumeKg(null)).toBeNull()
    })
})

describe('formatCompact', () => {
    it('shortens large values for axes', () => {
        expect(formatCompact(12_480)).toBe('12.5k')
        expect(formatCompact(950)).toBe('950')
    })
})
