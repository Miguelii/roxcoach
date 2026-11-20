import { activityDurationS } from '@/_bff/core/utils/activity-time.utils'
import { addDays } from '@/_bff/core/utils/week-dates.utils'

type WeekTotals = {
    doneMinutes: number
    doneSessions: number
    runKm: number
}

type LoadLabel = 'Light' | 'Balanced' | 'Ramping fast' | 'Too high'

// Structural subset of the training `CalendarItem` (core cannot import module types).
type StatsActivity = Parameters<typeof activityDurationS>[0] & {
    category: string
    distanceM: number | null
}

type StatsItem = { type: string; date: string } & (
    | { type: 'activity'; activity: StatsActivity }
    | { type: string; activity?: undefined }
)

type ActivityItem = { type: 'activity'; date: string; activity: StatsActivity }

// Races are not training load: every stat here reads activities only.
const activitiesIn = (items: StatsItem[], from: string, to: string): ActivityItem[] =>
    items.filter(
        (item): item is ActivityItem =>
            item.type === 'activity' && item.date >= from && item.date <= to
    )

const minutesOf = (item: ActivityItem) => (activityDurationS(item.activity) ?? 0) / 60

/** Totals of the activities from `from` to `to` (inclusive). */
export const computeTotals = (items: StatsItem[], from: string, to: string): WeekTotals => {
    const totals: WeekTotals = { doneMinutes: 0, doneSessions: 0, runKm: 0 }

    for (const item of activitiesIn(items, from, to)) {
        totals.doneMinutes += minutesOf(item)
        totals.doneSessions += 1
        if (item.activity.category === 'run') totals.runKm += (item.activity.distanceM ?? 0) / 1000
    }

    return totals
}

/** Acute (last 7 days) to chronic (weekly average of the 28 days before) load ratio, or null without history. */
export const computeLoadRatio = (items: StatsItem[], today: string) => {
    const minutesIn = (from: string, to: string) =>
        activitiesIn(items, from, to).reduce((sum, item) => sum + minutesOf(item), 0)

    const acute = minutesIn(addDays(today, -6), today)
    const chronic = minutesIn(addDays(today, -34), addDays(today, -7)) / 4

    return chronic > 0 ? acute / chronic : null
}

export const loadLabel = (ratio: number | null): LoadLabel | null => {
    if (ratio == null) return null
    if (ratio < 0.8) return 'Light'
    if (ratio <= 1.3) return 'Balanced'
    if (ratio <= 1.5) return 'Ramping fast'
    return 'Too high'
}
