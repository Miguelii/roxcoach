import { describe, expect, it } from 'vitest'
import {
    localDateIn,
    localDayBoundsUtc,
    todayIn,
    validTimezoneOrUtc,
} from '@/_bff/core/utils/date.utils'

describe('validTimezoneOrUtc', () => {
    it('keeps a valid timezone and falls back to UTC otherwise', () => {
        expect(validTimezoneOrUtc('Europe/Lisbon')).toBe('Europe/Lisbon')
        expect(validTimezoneOrUtc('Mars/Olympus')).toBe('UTC')
        expect(validTimezoneOrUtc('')).toBe('UTC')
    })
})

describe('todayIn', () => {
    it('returns the calendar date in the given timezone, not in UTC', () => {
        expect(todayIn('Europe/Lisbon', new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01')
        expect(todayIn('UTC', new Date('2026-06-30T23:30:00Z'))).toBe('2026-06-30')
    })

    it('goes back a day for timezones behind UTC', () => {
        expect(todayIn('America/Sao_Paulo', new Date('2026-07-01T01:00:00Z'))).toBe('2026-06-30')
    })

    it('defaults to the current time', () => {
        expect(todayIn('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
    })
})

describe('localDateIn', () => {
    it('keeps the UTC date in Lisbon winter and moves it forward in Tokyo', () => {
        expect(localDateIn('2026-11-20T23:30:00Z', 'Europe/Lisbon')).toBe('2026-11-20')
        expect(localDateIn('2026-11-20T23:30:00Z', 'Asia/Tokyo')).toBe('2026-11-21')
    })
})

describe('localDayBoundsUtc', () => {
    const hours = ({ fromIso, toIso }: { fromIso: string; toIso: string }) =>
        (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000

    it('gives different intervals for the same UTC instant in Lisbon and Auckland', () => {
        const instant = new Date('2026-11-20T23:30:00Z')
        const lisbonDate = todayIn('Europe/Lisbon', instant)
        const aucklandDate = todayIn('Pacific/Auckland', instant)
        expect(lisbonDate).toBe('2026-11-20')
        expect(aucklandDate).toBe('2026-11-21')
        expect(localDayBoundsUtc(lisbonDate, 'Europe/Lisbon')).toEqual({
            fromIso: '2026-11-20T00:00:00.000Z',
            toIso: '2026-11-21T00:00:00.000Z',
        })
        // NZDT is UTC+13 in November.
        expect(localDayBoundsUtc(aucklandDate, 'Pacific/Auckland')).toEqual({
            fromIso: '2026-11-20T11:00:00.000Z',
            toIso: '2026-11-21T11:00:00.000Z',
        })
    })

    it('is 23 hours long on the spring-forward day in Lisbon', () => {
        const bounds = localDayBoundsUtc('2026-03-29', 'Europe/Lisbon')
        expect(bounds.fromIso).toBe('2026-03-29T00:00:00.000Z')
        expect(bounds.toIso).toBe('2026-03-29T23:00:00.000Z')
        expect(hours(bounds)).toBe(23)
    })

    it('handles the New York DST days (23 and 25 hours)', () => {
        const spring = localDayBoundsUtc('2026-03-08', 'America/New_York')
        expect(spring.fromIso).toBe('2026-03-08T05:00:00.000Z')
        expect(hours(spring)).toBe(23)
        const autumn = localDayBoundsUtc('2026-11-01', 'America/New_York')
        expect(autumn.fromIso).toBe('2026-11-01T04:00:00.000Z')
        expect(hours(autumn)).toBe(25)
    })

    it('handles a half-hour offset (Asia/Kolkata, UTC+5:30)', () => {
        expect(localDayBoundsUtc('2026-11-20', 'Asia/Kolkata')).toEqual({
            fromIso: '2026-11-19T18:30:00.000Z',
            toIso: '2026-11-20T18:30:00.000Z',
        })
    })
})
