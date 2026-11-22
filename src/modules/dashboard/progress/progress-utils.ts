import { HR_ZONES, type ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { formatClock, formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunBucketDTO, TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { addDays } from '@/_bff/core/utils/week-dates.utils'
import { isoWeekNumber } from '@/modules/calendar/date-utils'

type Granularity = 'week' | 'month'

type Verdict = 'progressing' | 'steady' | 'declining' | 'mixed'

export type ZoneSeriesPoint = {
    start: string
    paceSecPerKm: number | null
    minutes: number
    // Mean of this point and the points with data before it, up to `ZONE_TREND_WINDOW` of them.
    trendSecPerKm: number | null
}

export type ZoneSeries = { zone: ZoneNumber; points: ZoneSeriesPoint[] }

export type ExerciseInsights = {
    // From the top set of the first and the latest workout: more weight with the same or more reps,
    // or the same weight with more reps, is progress; the opposite is slipping; more of one and less
    // of the other is a trade ('mixed').
    verdict: Verdict
    loadDeltaKg: number
    repsDelta: number
    firstDate: string
    // How many workouts ago the heaviest top set was done (0 is the latest workout).
    heaviestWorkoutsAgo: number
}

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

export const ZONE_TREND_WINDOW = 3

const zonePointOf = (bucket: RunBucketDTO, zone: ZoneNumber) =>
    bucket.zones.find((point) => point.zone === zone)

/** The zones that have at least one point in the range, lowest first. */
export const zonesWithData = (buckets: RunBucketDTO[]) =>
    HR_ZONES.map((zone) => zone.zone).filter((zone) =>
        buckets.some((bucket) => zonePointOf(bucket, zone)?.paceSecPerKm != null)
    )

/** The zone shown first: the one with the most minutes in the range (a tie goes to the lower zone). */
export const defaultZone = (buckets: RunBucketDTO[]): ZoneNumber | null => {
    let best: { zone: ZoneNumber; minutes: number } | null = null
    for (const zone of zonesWithData(buckets)) {
        const minutes = buckets.reduce((sum, bucket) => {
            const point = zonePointOf(bucket, zone)
            return sum + (point?.paceSecPerKm == null ? 0 : point.minutes)
        }, 0)
        if (best === null || minutes > best.minutes) best = { zone, minutes }
    }
    return best?.zone ?? null
}

const firstIndexWithData = (buckets: RunBucketDTO[], zone: ZoneNumber) =>
    buckets.findIndex((bucket) => zonePointOf(bucket, zone)?.paceSecPerKm != null)

/**
 * The points of each zone, all from the first bucket where any of them has data to the end of the
 * range, so the chart does not open on empty months and every series shares the same buckets. Each
 * point carries a trailing trend that smooths the weekly noise. A zone without data is left out.
 */
export const zoneSeries = (buckets: RunBucketDTO[], zones: ZoneNumber[]): ZoneSeries[] => {
    const withData = zones.flatMap((zone) => {
        const start = firstIndexWithData(buckets, zone)
        return start === -1 ? [] : [{ zone, start }]
    })
    if (withData.length === 0) return []
    const shared = buckets.slice(Math.min(...withData.map(({ start }) => start)))

    return withData.map(({ zone }) => ({ zone, points: trailingTrend(shared, zone) }))
}

const trailingTrend = (buckets: RunBucketDTO[], zone: ZoneNumber): ZoneSeriesPoint[] => {
    const recent: number[] = []
    return buckets.map((bucket) => {
        const point = zonePointOf(bucket, zone)
        const pace = point?.paceSecPerKm ?? null
        if (pace === null)
            return { start: bucket.start, paceSecPerKm: null, minutes: 0, trendSecPerKm: null }

        recent.push(pace)
        if (recent.length > ZONE_TREND_WINDOW) recent.shift()
        return {
            start: bucket.start,
            paceSecPerKm: pace,
            minutes: point?.minutes ?? 0,
            trendSecPerKm: recent.reduce((sum, value) => sum + value, 0) / recent.length,
        }
    })
}

const MONTH_NAME = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })

/**
 * The zone chart takeaway. The change compares the latest trend with the first trend built on a
 * full window (or the last one, with fewer points), so one odd week neither starts nor ends it.
 */
export const zoneSummary = (points: ZoneSeriesPoint[], zone: ZoneNumber) => {
    const withData = points.filter((point) => point.trendSecPerKm !== null)
    const label = `Z${zone}`
    const first = withData[0]
    const last = withData.at(-1)
    if (first === undefined || last === undefined) return `No ${label} pace in this range.`

    const now = formatPaceSeconds(last.trendSecPerKm) ?? ''
    if (withData.length < 2) return `${label} pace ${now}. More runs needed for a trend.`

    const baseline = withData[Math.min(ZONE_TREND_WINDOW, withData.length) - 1] ?? first
    const delta = (last.trendSecPerKm ?? 0) - (baseline.trendSecPerKm ?? 0)
    const since = MONTH_NAME.format(new Date(`${first.start}T00:00:00Z`))
    if (Math.abs(delta) <= PACE_STEADY_SECONDS)
        return `${label} pace held steady near ${now} since ${since}.`
    return `${label} pace ${now}, ${formatClock(Math.abs(delta)) ?? ''} ${delta < 0 ? 'faster' : 'slower'} than in ${since}.`
}

const verdictOf = (loadDeltaKg: number, repsDelta: number): Verdict => {
    if (loadDeltaKg === 0 && repsDelta === 0) return 'steady'
    if (loadDeltaKg >= 0 && repsDelta >= 0) return 'progressing'
    if (loadDeltaKg <= 0 && repsDelta <= 0) return 'declining'
    return 'mixed'
}

/**
 * How an exercise moved from its first to its latest workout in the range: the change in the
 * weight and the reps of the top set, a verdict from both and how long ago the heaviest top set was.
 * Null with fewer than two workouts.
 */
export function exerciseInsights(points: TopExerciseDTO['points']): ExerciseInsights | null {
    const first = points[0]
    const last = points.at(-1)
    if (first === undefined || last === undefined || points.length < 2) return null

    const loadDeltaKg = last.topSetKg - first.topSetKg
    const repsDelta = last.topSetReps - first.topSetReps

    let heaviestIndex = 0
    for (const [index, point] of points.entries()) {
        const heaviest = points[heaviestIndex]
        if (
            heaviest !== undefined &&
            (point.topSetKg > heaviest.topSetKg ||
                (point.topSetKg === heaviest.topSetKg && point.topSetReps >= heaviest.topSetReps))
        )
            heaviestIndex = index
    }

    return {
        verdict: verdictOf(loadDeltaKg, repsDelta),
        loadDeltaKg,
        repsDelta,
        firstDate: first.date,
        heaviestWorkoutsAgo: points.length - 1 - heaviestIndex,
    }
}

type LiftRef = { name: string; imageUrl: string | null }

export type StrengthSummary = {
    // Lifts with at least two workouts.
    rated: number
    progressing: number
    steady: number
    declining: number
    mixed: number
    // Top sets heavier than every earlier top set of the same lift in the range (the first workout of a lift never counts).
    records: number
    heaviest: (LiftRef & { topSetKg: number; topSetReps: number }) | null
    // Mean change in the reps of the top set from the first to the latest workout, over the rated lifts.
    avgRepsDelta: number | null
    bestGain: (LiftRef & { loadDeltaKg: number }) | null
    slipping: LiftRef[]
}

const MAX_SLIPPING_SHOWN = 3

/** The progress of every lift at a glance, from the same points the exercise cards use. */
export function strengthSummary(exercises: TopExerciseDTO[]): StrengthSummary {
    const summary: StrengthSummary = {
        rated: 0,
        progressing: 0,
        steady: 0,
        declining: 0,
        mixed: 0,
        records: 0,
        heaviest: null,
        avgRepsDelta: null,
        bestGain: null,
        slipping: [],
    }
    let repsDeltaSum = 0

    for (const exercise of exercises) {
        let heaviestSoFar = 0
        for (const [index, point] of exercise.points.entries()) {
            if (index > 0 && point.topSetKg > heaviestSoFar) summary.records += 1
            heaviestSoFar = Math.max(heaviestSoFar, point.topSetKg)

            const top = summary.heaviest
            if (
                top === null ||
                point.topSetKg > top.topSetKg ||
                (point.topSetKg === top.topSetKg && point.topSetReps > top.topSetReps)
            )
                summary.heaviest = {
                    name: exercise.name,
                    imageUrl: exercise.imageUrl,
                    topSetKg: point.topSetKg,
                    topSetReps: point.topSetReps,
                }
        }

        const insights = exerciseInsights(exercise.points)
        if (insights === null) continue
        summary.rated += 1
        repsDeltaSum += insights.repsDelta
        summary[insights.verdict] += 1
        if (insights.verdict === 'declining')
            summary.slipping.push({ name: exercise.name, imageUrl: exercise.imageUrl })
        if (
            insights.verdict === 'progressing' &&
            insights.loadDeltaKg > 0 &&
            (summary.bestGain === null || insights.loadDeltaKg > summary.bestGain.loadDeltaKg)
        )
            summary.bestGain = {
                name: exercise.name,
                imageUrl: exercise.imageUrl,
                loadDeltaKg: insights.loadDeltaKg,
            }
    }

    summary.slipping = summary.slipping.slice(0, MAX_SLIPPING_SHOWN)
    if (summary.rated > 0) summary.avgRepsDelta = repsDeltaSum / summary.rated
    return summary
}
