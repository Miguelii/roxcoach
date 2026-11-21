import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import { estimateOneRepMax } from '@/_bff/core/helpers/strength-detail.helper'
import type { RunBucketDTO, TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { addDays } from '@/_bff/core/utils/week-dates.utils'
import { isoWeekNumber } from '@/modules/calendar/date-utils'

type Granularity = 'week' | 'month'

type Verdict = 'progressing' | 'steady' | 'declining'

export type ExerciseInsights = {
    // From the estimated 1RM, which folds load and reps together; null when it cannot be estimated.
    verdict: Verdict | null
    loadDeltaKg: number
    repsDelta: number
    e1rmDeltaKg: number | null
    firstDate: string
    // How many workouts ago the best estimated 1RM was set (0 is the latest workout).
    bestWorkoutsAgo: number | null
}

const VERDICT_THRESHOLD = 0.02

const MONTHS_BY_RANGE: Record<ProgressRange, number> = { '3m': 3, '6m': 6, '12m': 12 }

const WEEK_LABEL = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
})
const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
})

/** Short axis label of a bucket start: `16 Nov` for a week, `Nov 26` for a month. */
export const bucketLabel = (start: string, granularity: Granularity) => {
    const date = new Date(`${start}T00:00:00Z`)
    return (granularity === 'week' ? WEEK_LABEL : MONTH_LABEL).format(date)
}

const MONTH_YEAR_LABEL = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
})

const dayMonth = (iso: string) => WEEK_LABEL.format(new Date(`${iso}T00:00:00Z`))

/** Full name of a bucket: `Week 47 · 16 to 22 Nov` (or `30 Nov to 6 Dec`), `November 2026` for a month. */
export const bucketRangeLabel = (start: string, granularity: Granularity) => {
    if (granularity === 'month') return MONTH_YEAR_LABEL.format(new Date(`${start}T00:00:00Z`))
    const end = addDays(start, 6)
    const sameMonth = start.slice(0, 7) === end.slice(0, 7)
    const from = sameMonth ? String(Number(start.slice(8, 10))) : dayMonth(start)
    return `Week ${isoWeekNumber(start)} · ${from} to ${dayMonth(end)}`
}

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
})

/** `Wed 18 Nov`, for a plain date. */
export const dayLabel = (date: string) => DAY_LABEL.format(new Date(`${date}T00:00:00Z`))

/** `6 months`, for the chart summaries. */
export const rangeLabel = (range: ProgressRange) => `${MONTHS_BY_RANGE[range]} months`

/** `today`, `tomorrow` or `in 23 days`. */
export const daysLeftLabel = (days: number) => {
    if (days <= 0) return 'today'
    if (days === 1) return 'tomorrow'
    return `in ${days} days`
}

const PACE_STEADY_SECONDS = 3

/** One sentence for screen readers: where the average pace went over the range. */
export const paceSummary = (buckets: RunBucketDTO[], range: ProgressRange) => {
    const paces = buckets.flatMap((bucket) => bucket.paceSecPerKm ?? [])
    const first = paces[0]
    const last = paces.at(-1)
    if (first === undefined || last === undefined) return 'No pace data in this range.'
    if (paces.length < 2) return `Average pace ${formatPaceSeconds(last) ?? ''}.`

    const from = formatPaceSeconds(first) ?? ''
    const to = formatPaceSeconds(last) ?? ''
    const span = rangeLabel(range)
    if (Math.abs(last - first) <= PACE_STEADY_SECONDS)
        return `Average pace held steady near ${to} over ${span}.`
    return `Average pace ${last < first ? 'improved' : 'slowed'} from ${from} to ${to} over ${span}.`
}

/**
 * How an exercise moved from its first to its latest workout in the range: the change in load,
 * reps and estimated 1RM, a verdict (1RM up or down by 2% or more, else steady) and how long ago
 * the best 1RM was. Null with fewer than two workouts.
 */
export function exerciseInsights(points: TopExerciseDTO['points']): ExerciseInsights | null {
    const first = points[0]
    const last = points.at(-1)
    if (first === undefined || last === undefined || points.length < 2) return null

    const firstE1rm = estimateOneRepMax(first.topSetKg, first.topSetReps)
    const lastE1rm = estimateOneRepMax(last.topSetKg, last.topSetReps)
    let verdict: Verdict | null = null
    let e1rmDeltaKg: number | null = null
    if (firstE1rm !== null && lastE1rm !== null) {
        e1rmDeltaKg = lastE1rm - firstE1rm
        const change = e1rmDeltaKg / firstE1rm
        verdict =
            change >= VERDICT_THRESHOLD
                ? 'progressing'
                : change <= -VERDICT_THRESHOLD
                  ? 'declining'
                  : 'steady'
    }

    let bestIndex: number | null = null
    let best = 0
    for (const [index, point] of points.entries()) {
        const estimate = estimateOneRepMax(point.topSetKg, point.topSetReps)
        if (estimate !== null && estimate >= best) {
            best = estimate
            bestIndex = index
        }
    }

    return {
        verdict,
        loadDeltaKg: last.topSetKg - first.topSetKg,
        repsDelta: last.topSetReps - first.topSetReps,
        e1rmDeltaKg,
        firstDate: first.date,
        bestWorkoutsAgo: bestIndex === null ? null : points.length - 1 - bestIndex,
    }
}
