import type {
    RunType,
    RunTypeRules,
    WeeklyGoals,
} from '@/_bff/core/constants/weekly-goals.constants'
import { formatClock, formatKmNumber } from '@/_bff/core/utils/formatters.utils'
import { addDays, isoWeekday, startOfWeek } from '@/_bff/core/utils/week-dates.utils'

type GoalProgress = { goal: number; done: number; remaining: number }

export type WeeklyGoalProgress = {
    daysLeft: number
    distanceM: GoalProgress | null
    longRuns: GoalProgress | null
    fastRuns: GoalProgress | null
    strengthSessions: GoalProgress | null
}

// Structural subset of the training `CalendarItem` (core cannot import module types).
type GoalItem = {
    type: string
    date: string
    activity?: { category: string; distanceM: number | null; runType: RunType | null }
}

type ProgressInput = { goals: WeeklyGoals; items: GoalItem[]; today: string }

const progressOf = (goal: number | null, done: number): GoalProgress | null =>
    goal == null ? null : { goal, done, remaining: Math.max(goal - done, 0) }

export const computeWeeklyGoalProgress = ({
    goals,
    items,
    today,
}: ProgressInput): WeeklyGoalProgress => {
    const from = startOfWeek(today)
    const to = addDays(from, 6)
    let distanceM = 0
    let longRuns = 0
    let fastRuns = 0
    let strengthSessions = 0

    for (const item of items) {
        const { activity } = item
        if (item.type !== 'activity' || !activity || item.date < from || item.date > to) continue
        if (activity.category === 'strength') strengthSessions += 1
        if (activity.category !== 'run') continue
        distanceM += activity.distanceM ?? 0
        if (activity.runType === 'long') longRuns += 1
        if (activity.runType === 'fast') fastRuns += 1
    }

    return {
        daysLeft: 8 - isoWeekday(today),
        distanceM: progressOf(goals.weeklyRunDistanceM, distanceM),
        longRuns: progressOf(goals.longRunsPerWeek, longRuns),
        fastRuns: progressOf(goals.fastRunsPerWeek, fastRuns),
        strengthSessions: progressOf(goals.strengthSessionsPerWeek, strengthSessions),
    }
}

export const describeRunTypeRules = ({
    shortRunMaxM,
    longRunMinM,
    fastPaceSPerKm,
}: RunTypeRules) => {
    const shortKm = formatKmNumber(shortRunMaxM, 2)
    return (
        `Runs from ${shortKm} to ${formatKmNumber(longRunMinM, 2)} km faster than ${formatClock(fastPaceSPerKm)}/km are fast. ` +
        `Longer or slower runs are long. Runs under ${shortKm} km have no type.`
    )
}
