import { describe, expect, it } from 'vitest'
import { todayIn } from '@/_bff/core/utils/date.utils'

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
