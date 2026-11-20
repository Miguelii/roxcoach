import {
    addDays,
    DAY_MS,
    formatIsoDate as format,
    parseIsoDate as parse,
    isoWeekday,
    startOfWeek,
} from '@/_bff/core/utils/week-dates.utils'

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
    Math.round((parse(to).getTime() - parse(from).getTime()) / DAY_MS)

const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

export const addMonths = (iso: string, months: number) => {
    const date = parse(startOfMonth(iso))
    date.setUTCMonth(date.getUTCMonth() + months)
    return format(date)
}

/** ISO 8601 week number. */
export const isoWeekNumber = (iso: string) => {
    const thursday = parse(addDays(iso, 4 - isoWeekday(iso)))
    const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
    return Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7)
}

/** Weeks (Monday first) covering the month that contains `iso`. */
export const monthGrid = (iso: string) => {
    const first = startOfMonth(iso)
    const last = addDays(addMonths(iso, 1), -1)
    const weeks: string[][] = []

    for (let cursor = startOfWeek(first); cursor <= last; cursor = addDays(cursor, 7)) {
        weeks.push(Array.from({ length: 7 }, (_, index) => addDays(cursor, index)))
    }

    return weeks
}

export const weekDays = (iso: string) => {
    const start = startOfWeek(iso)
    return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export const dayOfMonth = (iso: string) => Number(iso.slice(8, 10))

export const monthLabel = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        parse(iso)
    )

export const shortDateLabel = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        parse(iso)
    )

export const longDateLabel = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    }).format(parse(iso))
