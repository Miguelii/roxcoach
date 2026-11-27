import { HYROX_DIVISIONS } from '@/_bff/core/constants/hyrox.constants'
import { activityDurationS } from '@/_bff/core/utils/activity-time.utils'
import {
    formatClock,
    formatDuration,
    formatKm,
    formatKmNumber,
    formatPace,
} from '@/_bff/core/utils/formatters.utils'
import {
    computeWeeklyGoalProgress,
    describeRunTypeRules,
    type WeeklyGoalProgress,
} from '@/_bff/core/utils/weekly-goals.utils'
import { computeLoadRatio, computeTotals, loadLabel } from '@/_bff/core/utils/week-stats.utils'
import {
    addDays,
    DAY_MS,
    isoWeekday,
    parseIsoDate,
    startOfWeek,
} from '@/_bff/core/utils/week-dates.utils'
import { CONTEXT_MAX_CHARS } from '@/_bff/modules/coach/constants'
import type { CoachContextInput } from '@/_bff/modules/coach/types'
import type { ActivityDTO } from '@/_bff/modules/training/types'

type Section = { title: string; lines: string[] }
type GoalProgress = WeeklyGoalProgress['longRuns']

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const WEEKS_SHOWN = 4
const RECENT_SHOWN = 10
const NO_ACTIVITIES = 'No activities in the last 35 days.'

const divisionLabel = (key: string) =>
    HYROX_DIVISIONS.find((item) => item.key === key)?.label ?? key

const weekdayName = (iso: string) => WEEKDAY_NAMES[isoWeekday(iso) - 1]

const renderSection = ({ title, lines }: Section) => [title, ...lines].join('\n')

const omittedNote = (count: number) =>
    count > 0 ? [`(${count} older entries omitted for length)`] : []

const todaySection = ({ today, timezone }: CoachContextInput): Section => ({
    title: 'Today',
    lines: [`${today} (${weekdayName(today)}), timezone ${timezone}`],
})

const athleteSection = ({ profile }: CoachContextInput): Section => {
    if (!profile) return { title: 'Athlete', lines: ['No profile saved yet.'] }

    const lines: string[] = []
    if (profile.maxHr != null) lines.push(`Max heart rate: ${profile.maxHr} bpm`)
    if (profile.restingHr != null) lines.push(`Resting heart rate: ${profile.restingHr} bpm`)
    if (profile.hyroxDivision) lines.push(`Hyrox division: ${divisionLabel(profile.hyroxDivision)}`)
    if (profile.weeklyHoursCap != null) lines.push(`Weekly hours cap: ${profile.weeklyHoursCap} h`)
    if (profile.notes) lines.push(`Notes: ${profile.notes}`)

    return { title: 'Athlete', lines: lines.length > 0 ? lines : ['No details saved yet.'] }
}

// Locale-independent ordering (plain code unit comparison).
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const daysBetween = (from: string, to: string) =>
    Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS)

const goalsSection = ({ races, today }: CoachContextInput): Section => {
    const upcoming = races
        .filter((race) => race.status === 'upcoming')
        .toSorted((a, b) => compareText(a.raceDate, b.raceDate) || compareText(a.name, b.name))

    if (upcoming.length === 0) return { title: 'Goals', lines: ['No upcoming races.'] }

    const lines = upcoming.map((race) => {
        const days = daysBetween(today, race.raceDate)
        const parts = [
            `${race.raceDate} ${race.name} (${race.raceType}, priority ${race.priority})`,
            days < 0 ? '(date passed)' : `${days} days to go`,
            `target ${formatClock(race.targetTimeS)}`,
        ]
        if (race.hyroxDivision) parts.push(divisionLabel(race.hyroxDivision))
        else if (race.distanceM != null) parts.push(formatKm(race.distanceM) ?? '')
        if (race.location) parts.push(`location ${race.location}`)
        if (race.notes) parts.push(`notes: ${race.notes}`)

        return `- ${parts.join(', ')}`
    })

    return { title: 'Goals', lines }
}

const toStatsItems = (activities: ActivityDTO[]) =>
    activities.map((activity) => ({
        type: 'activity' as const,
        date: activity.localDate,
        activity,
    }))

const countLine = (label: string, progress: GoalProgress) =>
    progress ? [`${label}: ${progress.done} of ${progress.goal} done`] : []

const weeklyGoalsSection = ({ goals, activities, today }: CoachContextInput): Section => {
    const progress = computeWeeklyGoalProgress({ goals, items: toStatsItems(activities), today })
    const lines: string[] = []
    const { distanceM } = progress
    if (distanceM) {
        const toGo =
            distanceM.remaining > 0 ? `, ${formatKmNumber(distanceM.remaining)} km to go` : ''
        lines.push(
            `Running distance: ${formatKmNumber(distanceM.done)} of ${formatKmNumber(distanceM.goal)} km done${toGo}`
        )
    }
    lines.push(
        ...countLine('Long runs', progress.longRuns),
        ...countLine('Fast runs', progress.fastRuns),
        ...countLine('Strength sessions', progress.strengthSessions)
    )

    const rule = describeRunTypeRules(goals.runTypeRules)
    if (lines.length === 0) return { title: 'Weekly goals', lines: ['No weekly goals set.', rule] }

    return {
        title: 'Weekly goals',
        lines: [...lines, `Days left this week, today included: ${progress.daysLeft}`, rule],
    }
}

const weeksSection = (input: CoachContextInput, shown: number): Section => {
    if (input.activities.length === 0) return { title: 'Last 4 weeks', lines: [NO_ACTIVITIES] }

    const items = toStatsItems(input.activities)
    const currentWeek = startOfWeek(input.today)
    const lines: string[] = []

    for (let index = 0; index < shown; index++) {
        const weekStart = addDays(currentWeek, -7 * index)
        const totals = computeTotals(items, weekStart, addDays(weekStart, 6))
        lines.push(
            `Week of ${weekStart}: ${formatDuration(totals.doneMinutes * 60)}, ${totals.doneSessions} sessions, ${totals.runKm.toFixed(1)} km run`
        )
    }

    const ratio = computeLoadRatio(items, input.today)
    const label = loadLabel(ratio)
    if (ratio != null && label)
        lines.push(
            `Load ratio (last 7 days to weekly average of the 28 days before): ${ratio.toFixed(2)} (${label})`
        )

    return { title: 'Last 4 weeks', lines: [...lines, ...omittedNote(WEEKS_SHOWN - shown)] }
}

const activityLine = (activity: ActivityDTO) => {
    const parts = [activity.localDate, activity.name, activity.category]
    const distance = formatKm(activity.distanceM)
    const pace = activity.category === 'run' ? formatPace(activity.avgSpeedMps) : null
    if (distance && pace) parts.push(`${distance} at ${pace}`)
    else if (distance) parts.push(distance)
    const duration = formatDuration(activityDurationS(activity))
    if (duration) parts.push(duration)
    if (activity.avgHr != null) parts.push(`avg HR ${activity.avgHr}`)
    if (activity.perceivedEffort != null) parts.push(`effort ${activity.perceivedEffort}`)
    if (activity.category === 'run' && activity.runType) parts.push(`${activity.runType} run`)

    return `- ${parts.join(' | ')}`
}

const recentSection = ({ activities }: CoachContextInput, shown: number): Section => {
    if (activities.length === 0) return { title: 'Recent', lines: [NO_ACTIVITIES] }

    const newest = activities
        .toSorted(
            (a, b) =>
                b.localDate.localeCompare(a.localDate) || b.startedAt.localeCompare(a.startedAt)
        )
        .slice(0, RECENT_SHOWN)

    return {
        title: 'Recent',
        lines: [
            ...newest.slice(0, shown).map((item) => activityLine(item)),
            ...omittedNote(newest.length - shown),
        ],
    }
}

/**
 * Builds the data block sent with every coach request. Pure: the weekday comes from the date string.
 * Over `maxChars`, Recent shrinks first, then Last 4 weeks; the other sections are never cut.
 */
export const buildCoachContext = (
    input: CoachContextInput,
    maxChars: number = CONTEXT_MAX_CHARS
): string => {
    const fixed = [
        todaySection(input),
        athleteSection(input),
        goalsSection(input),
        weeklyGoalsSection(input),
    ]
    const render = (weeks: number, recent: number) =>
        [...fixed, weeksSection(input, weeks), recentSection(input, recent)]
            .map((section) => renderSection(section))
            .join('\n\n')

    let weeks = WEEKS_SHOWN
    let recent = RECENT_SHOWN
    let text = render(weeks, recent)

    while (text.length > maxChars && (recent > 0 || weeks > 0)) {
        if (recent > 0) recent--
        else weeks--
        text = render(weeks, recent)
    }

    return text
}
