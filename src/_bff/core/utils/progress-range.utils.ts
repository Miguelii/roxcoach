import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import {
    addDays,
    formatIsoDate,
    parseIsoDate,
    startOfWeek,
} from '@/_bff/core/utils/week-dates.utils'

type Granularity = 'week' | 'month'

type RangeBounds = { from: string; granularity: Granularity }

const WEEKS_BY_RANGE = { '3m': 13, '6m': 26, '12m': 52 } as const

const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

/** First date of the bucket that contains `date`: Monday for weeks, the 1st for months. */
export const bucketStartOf = (date: string, granularity: Granularity) =>
    granularity === 'week' ? startOfWeek(date) : firstOfMonth(date)

const nextBucketStart = (start: string, granularity: Granularity) => {
    if (granularity === 'week') return addDays(start, 7)
    const d = parseIsoDate(start)
    return formatIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))
}

/** Start date and bucket size of a progress range ending with the week that contains `today`. */
export function rangeBounds(today: string, range: ProgressRange): RangeBounds {
    return {
        from: addDays(startOfWeek(today), -7 * (WEEKS_BY_RANGE[range] - 1)),
        granularity: 'week',
    }
}

/** Every bucket start from `from` through the bucket containing `today`, with no gaps. */
export function bucketStarts(from: string, today: string, granularity: Granularity): string[] {
    const last = bucketStartOf(today, granularity)
    const starts: string[] = []
    for (let s = from; s <= last; s = nextBucketStart(s, granularity)) starts.push(s)
    return starts
}
