import { formatClock } from '@/_bff/core/utils/formatters.utils'
import type { RaceDTO } from '@/_bff/modules/races/types'

export const PRIORITY_LABELS: Record<RaceDTO['priority'], string> = {
    A: 'Target race',
    B: 'Tune-up',
    C: 'Training race',
}

export const RACE_TYPE_LABELS: Record<RaceDTO['raceType'], string> = {
    hyrox: 'Hyrox',
    running: 'Running',
    other: 'Other',
}

const DAY_MS = 86_400_000

// Whole days from `today` to `date`, both plain YYYY-MM-DD strings (no timezone math needed).
export const daysUntil = (today: string, date: string) =>
    Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)

// "42 days to go", "1 day to go", "Today"; past dates read "N days ago".
export const formatDaysToGo = (days: number) => {
    if (days === 0) return 'Today'
    if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} to go`
    return `${-days} ${days === -1 ? 'day' : 'days'} ago`
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
})

// `2027-03-06` as "Sat, 6 Mar 2027".
export const formatRaceDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`))

// Plain-text comparison of a result with the goal; null when there is no result.
export const formatDelta = (goalS: number, resultS: number | null) => {
    if (resultS === null) return null
    const diff = resultS - goalS
    if (diff === 0) return 'On goal'
    return `${formatClock(Math.abs(diff))} ${diff > 0 ? 'slower' : 'faster'} than goal`
}
