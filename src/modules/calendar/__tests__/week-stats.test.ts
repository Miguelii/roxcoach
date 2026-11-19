import { describe, expect, it } from 'vitest'
import { computeLoadRatio, computeTotals, loadLabel } from '@/modules/calendar/week-stats'
import type { CalendarItem, MockActivity, MockPlannedSession } from '@/modules/mock/types'

const activity = (date: string, minutes: number, distanceM: number | null): CalendarItem => {
    const value: MockActivity = {
        id: `a-${date}`,
        date,
        category: 'run',
        name: 'Run',
        durationS: minutes * 60,
        distanceM,
        avgHr: null,
        rpe: null,
        source: 'strava',
    }
    return { type: 'activity', date, activity: value }
}

const planned = (date: string, minutes: number): CalendarItem => {
    const session: MockPlannedSession = {
        id: `p-${date}`,
        date,
        kind: 'run',
        title: 'Run',
        description: '',
        targetMinutes: minutes,
        status: 'planned',
        matchedActivityId: null,
        raceId: null,
    }
    return { type: 'planned', date, session }
}

describe('computeTotals', () => {
    it('adds done activities and remaining planned sessions', () => {
        const items = [
            activity('2026-11-16', 45, 8000),
            planned('2026-11-20', 60),
            activity('2026-11-30', 30, 5000),
        ]

        expect(computeTotals(items, '2026-11-16', '2026-11-22')).toEqual({
            doneMinutes: 45,
            plannedMinutes: 105,
            doneSessions: 1,
            totalSessions: 2,
            runKm: 8,
        })
    })

    it('returns zeros for an empty range', () => {
        expect(computeTotals([], '2026-11-16', '2026-11-22').totalSessions).toBe(0)
    })
})

describe('computeLoadRatio', () => {
    it('returns null when there is no chronic history', () => {
        expect(computeLoadRatio([activity('2026-11-18', 60, null)], '2026-11-19')).toBeNull()
    })

    it('divides the last 7 days by the weekly average of the 28 before', () => {
        const items = [activity('2026-11-18', 120, null), activity('2026-11-01', 240, null)]

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
