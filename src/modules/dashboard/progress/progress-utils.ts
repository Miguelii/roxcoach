import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { formatPaceSeconds } from '@/_bff/core/utils/formatters.utils'
import type { RunBucketDTO } from '@/_bff/modules/training/types/progress'

type Granularity = 'week' | 'month'

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
