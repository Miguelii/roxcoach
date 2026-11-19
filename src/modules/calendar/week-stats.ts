import { addDays } from '@/modules/calendar/date-utils'
import type { CalendarItem } from '@/modules/mock/types'

type WeekTotals = {
    doneMinutes: number
    plannedMinutes: number
    doneSessions: number
    totalSessions: number
    runKm: number
}

type LoadLabel = 'Light' | 'Balanced' | 'Ramping fast' | 'Too high'

const inRange = (item: CalendarItem, from: string, to: string) =>
    item.date >= from && item.date <= to

/** Totals for the days `from` to `to` (inclusive): what was done, and what the week was meant to hold. */
export const computeTotals = (items: CalendarItem[], from: string, to: string): WeekTotals => {
    const totals: WeekTotals = {
        doneMinutes: 0,
        plannedMinutes: 0,
        doneSessions: 0,
        totalSessions: 0,
        runKm: 0,
    }

    for (const item of items) {
        if (!inRange(item, from, to)) continue

        if (item.type === 'activity') {
            const minutes = item.activity.durationS / 60
            totals.doneMinutes += minutes
            totals.plannedMinutes += minutes
            totals.doneSessions += 1
            totals.totalSessions += 1
            if (item.activity.category === 'run')
                totals.runKm += (item.activity.distanceM ?? 0) / 1000
        }

        if (item.type === 'planned' && item.session.status === 'planned') {
            totals.plannedMinutes += item.session.targetMinutes
            totals.totalSessions += 1
        }
    }

    return totals
}

/** Acute (last 7 days) to chronic (weekly average of the 28 days before) load ratio, or null without history. */
export const computeLoadRatio = (items: CalendarItem[], today: string) => {
    const minutesIn = (from: string, to: string) =>
        items.reduce(
            (sum, item) =>
                item.type === 'activity' && inRange(item, from, to)
                    ? sum + item.activity.durationS / 60
                    : sum,
            0
        )

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
