import { describe, expect, it } from 'vitest'
import {
    addUtcDays,
    getLyftaSyncStart,
    getLyftaSyncWindow,
} from '@/_bff/modules/lyfta/utils/sync-windows.utils'

describe('addUtcDays', () => {
    it('crosses month, year and leap-year boundaries', () => {
        expect(addUtcDays('2026-03-01', -1)).toBe('2026-02-28')
        expect(addUtcDays('2028-03-01', -1)).toBe('2028-02-29')
        expect(addUtcDays('2026-12-31', 1)).toBe('2027-01-01')
    })
})

describe('getLyftaSyncStart', () => {
    it('starts the first sync exactly 360 UTC days before today', () => {
        expect(getLyftaSyncStart(null, new Date('2026-11-20T23:59:00Z'))).toBe('2025-11-25')
        // A leap day inside the span: 2028-03-01 minus 360 days.
        expect(getLyftaSyncStart(null, new Date('2028-03-01T00:00:00Z'))).toBe('2027-03-07')
        expect(getLyftaSyncStart(null, new Date('2026-01-01T12:00:00Z'))).toBe('2025-01-06')
    })

    it('respects a recent checkpoint with a one-day overlap', () => {
        expect(getLyftaSyncStart('2026-11-18T08:00:00Z', new Date('2026-11-20T00:00:00Z'))).toBe(
            '2026-11-17'
        )
    })

    it('clamps a very old checkpoint to the 360 day floor', () => {
        expect(getLyftaSyncStart('2019-05-01T00:00:00Z', new Date('2026-11-20T00:00:00Z'))).toBe(
            '2025-11-25'
        )
    })

    it('rejects a future or invalid checkpoint', () => {
        const now = new Date('2026-11-20T12:00:00Z')
        expect(() => getLyftaSyncStart('2026-11-22T12:00:00Z', now)).toThrow()
        expect(() => getLyftaSyncStart('nope', now)).toThrow()
    })
})

describe('getLyftaSyncWindow', () => {
    it('spans 90 inclusive UTC days and is not last while before today', () => {
        expect(getLyftaSyncWindow('2025-11-25', '2026-11-20')).toEqual({
            from: '2025-11-25',
            to: '2026-02-22',
            isLast: false,
        })
    })

    it('crosses a leap day and cuts the last window at today', () => {
        expect(getLyftaSyncWindow('2028-01-01', '2028-12-31').to).toBe('2028-03-30')
        expect(getLyftaSyncWindow('2026-09-01', '2026-11-20')).toEqual({
            from: '2026-09-01',
            to: '2026-11-20',
            isLast: true,
        })
    })

    it('covers a first sync in four full windows plus one for today', () => {
        const today = '2026-11-20'
        let from = getLyftaSyncStart(null, new Date(`${today}T10:00:00Z`))
        const windows = []
        for (;;) {
            const window = getLyftaSyncWindow(from, today)
            windows.push(window)
            if (window.isLast) break
            from = addUtcDays(window.to, 1)
        }
        expect(windows).toHaveLength(5)
        expect(windows.at(-1)?.to).toBe(today)
    })
})
