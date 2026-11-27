import { describe, expect, it } from 'vitest'
import {
    DEFAULT_RUN_TYPE_RULES,
    DEFAULT_WEEKLY_GOALS,
    type RunType,
    type WeeklyGoals,
} from '@/_bff/core/constants/weekly-goals.constants'
import {
    computeWeeklyGoalProgress,
    describeRunTypeRules,
} from '@/_bff/core/utils/weekly-goals.utils'

const TODAY = '2026-11-26'

const activity = (
    date: string,
    category: string,
    distanceM: number | null,
    runType: RunType | null = null
) => ({
    type: 'activity',
    date,
    activity: { category, distanceM, runType },
})

const goals = (overrides: Partial<WeeklyGoals>): WeeklyGoals => ({
    ...DEFAULT_WEEKLY_GOALS,
    ...overrides,
})

const daysLeft = (today: string) =>
    computeWeeklyGoalProgress({ goals: DEFAULT_WEEKLY_GOALS, items: [], today }).daysLeft

describe('computeWeeklyGoalProgress', () => {
    it('sums run distance and counts types for this week only', () => {
        const items = [
            activity('2026-11-22', 'run', 10000, 'long'),
            activity('2026-11-23', 'run', 5000, 'fast'),
            activity('2026-11-25', 'run', 8400, 'long'),
            activity('2026-11-24', 'hyrox', 8000),
            activity('2026-11-30', 'run', 5000),
        ]
        const progress = computeWeeklyGoalProgress({
            goals: goals({ weeklyRunDistanceM: 30000, longRunsPerWeek: 1, fastRunsPerWeek: 1 }),
            items,
            today: TODAY,
        })

        expect(progress.distanceM).toEqual({ goal: 30000, done: 13400, remaining: 16600 })
        expect(progress.longRuns).toEqual({ goal: 1, done: 1, remaining: 0 })
        expect(progress.fastRuns).toEqual({ goal: 1, done: 1, remaining: 0 })
    })

    it('counts strength sessions', () => {
        const items = [
            activity('2026-11-23', 'strength', null),
            activity('2026-11-26', 'strength', null),
            activity('2026-11-24', 'run', 5000),
            { type: 'race', date: '2026-11-25' },
        ]
        const progress = computeWeeklyGoalProgress({
            goals: goals({ strengthSessionsPerWeek: 3 }),
            items,
            today: TODAY,
        })

        expect(progress.strengthSessions).toEqual({ goal: 3, done: 2, remaining: 1 })
    })

    it('returns null for goals that are not set', () => {
        const progress = computeWeeklyGoalProgress({
            goals: DEFAULT_WEEKLY_GOALS,
            items: [],
            today: TODAY,
        })

        expect(progress).toEqual({
            daysLeft: 4,
            distanceM: null,
            longRuns: null,
            fastRuns: null,
            strengthSessions: null,
        })
    })

    it('never returns a negative remaining', () => {
        const progress = computeWeeklyGoalProgress({
            goals: goals({ weeklyRunDistanceM: 5000 }),
            items: [activity('2026-11-24', 'run', 12000)],
            today: TODAY,
        })

        expect(progress.distanceM).toEqual({ goal: 5000, done: 12000, remaining: 0 })
    })

    it('daysLeft is 7 on Monday, 4 on Thursday, 1 on Sunday', () => {
        expect(daysLeft('2026-11-23')).toBe(7)
        expect(daysLeft('2026-11-26')).toBe(4)
        expect(daysLeft('2026-11-29')).toBe(1)
    })
})

describe('describeRunTypeRules', () => {
    it('describes the default rules', () =>
        expect(describeRunTypeRules(DEFAULT_RUN_TYPE_RULES)).toBe(
            'Runs from 3 to 6 km faster than 5:00/km are fast. Longer or slower runs are long. Runs under 3 km have no type.'
        ))

    it('describes decimal thresholds', () =>
        expect(
            describeRunTypeRules({ shortRunMaxM: 3500, longRunMinM: 6500, fastPaceSPerKm: 285 })
        ).toBe(
            'Runs from 3.5 to 6.5 km faster than 4:45/km are fast. Longer or slower runs are long. Runs under 3.5 km have no type.'
        ))
})
