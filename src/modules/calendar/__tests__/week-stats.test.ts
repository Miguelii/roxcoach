import { describe, expect, it } from 'vitest'
import { computeLoadRatio, computeTotals, loadLabel } from '@/modules/calendar/week-stats'
import { makeItem } from '@/modules/calendar/__tests__/fixtures'

const run = (date: string, minutes: number, distanceM: number | null) =>
    makeItem({
        id: `a-${date}`,
        localDate: date,
        movingTimeS: minutes * 60,
        distanceM,
    })

describe('computeTotals', () => {
    it('adds the activities inside the range', () => {
        const items = [
            run('2026-11-16', 45, 8000),
            run('2026-11-20', 60, 10_000),
            run('2026-11-30', 30, 5000),
        ]

        expect(computeTotals(items, '2026-11-16', '2026-11-22')).toEqual({
            doneMinutes: 105,
            doneSessions: 2,
            runKm: 18,
        })
    })

    it('counts run distance for runs only and falls back to elapsed time', () => {
        const items = [
            makeItem({ category: 'hyrox', distanceM: 8000, movingTimeS: null, elapsedTimeS: 3600 }),
        ]

        expect(computeTotals(items, '2026-11-16', '2026-11-22')).toEqual({
            doneMinutes: 60,
            doneSessions: 1,
            runKm: 0,
        })
    })

    it('returns zeros for an empty range', () => {
        expect(computeTotals([], '2026-11-16', '2026-11-22')).toEqual({
            doneMinutes: 0,
            doneSessions: 0,
            runKm: 0,
        })
    })
})

describe('computeLoadRatio', () => {
    it('returns null when there is no chronic history', () => {
        expect(computeLoadRatio([run('2026-11-18', 60, null)], '2026-11-19')).toBeNull()
    })

    it('divides the last 7 days by the weekly average of the 28 before', () => {
        const items = [run('2026-11-18', 120, null), run('2026-11-01', 240, null)]

        expect(computeLoadRatio(items, '2026-11-19')).toBe(2)
    })
})

describe('loadLabel', () => {
    it('maps ratios to labels', () => {
        expect(loadLabel(null)).toBeNull()
        expect(loadLabel(0.5)).toBe('Light')
        expect(loadLabel(1)).toBe('Balanced')
        expect(loadLabel(1.4)).toBe('Ramping fast')
        expect(loadLabel(1.8)).toBe('Too high')
    })
})
