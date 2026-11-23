import {
    LOG_RANGE_MS,
    type LogEntry,
    type LogLevel,
    type LogRange,
} from '@/_bff/core/constants/logs.constants'

type LogFilters = { levels: LogLevel[]; sources: string[] }

export type LogFacet = { value: string; count: number }

export type HistogramBucket = Record<LogLevel, number> & { start: number }

const HISTOGRAM_BUCKETS = 30

const LOCALE = 'en-US'
const DAY_MS = LOG_RANGE_MS['24h']

// An empty selection means "everything" for that dimension.
export function filterLogs(logs: LogEntry[], { levels, sources }: LogFilters): LogEntry[] {
    return logs.filter(
        (log) =>
            (levels.length === 0 || levels.includes(log.level)) &&
            (sources.length === 0 || sources.includes(log.prefix))
    )
}

// Most frequent first, ties alphabetical.
export function buildFacets(logs: LogEntry[], key: 'level' | 'prefix'): LogFacet[] {
    const counts = new Map<string, number>()
    for (const log of logs) counts.set(log[key], (counts.get(log[key]) ?? 0) + 1)

    return Array.from(counts, ([value, count]) => ({ value, count })).toSorted(
        (a, b) => b.count - a.count || a.value.localeCompare(b.value)
    )
}

// Splits the window that ends at `endMs` into equal buckets; rows outside the window are ignored.
export function buildHistogram(
    logs: LogEntry[],
    range: LogRange,
    endMs: number
): HistogramBucket[] {
    const rangeMs = LOG_RANGE_MS[range]
    const bucketMs = rangeMs / HISTOGRAM_BUCKETS
    const startMs = endMs - rangeMs
    const buckets = Array.from({ length: HISTOGRAM_BUCKETS }, (_, index): HistogramBucket => ({
        start: startMs + index * bucketMs,
        error: 0,
        warn: 0,
        info: 0,
        debug: 0,
    }))

    for (const log of logs) {
        const offset = (Date.parse(log.created_at) - startMs) / bucketMs
        if (offset < 0 || offset >= HISTOGRAM_BUCKETS) continue
        buckets[Math.floor(offset)][log.level] += 1
    }

    return buckets
}

// Time of day up to 24 hours, date and time beyond.
export function formatLogTime(createdAt: string, range: LogRange): string {
    const date = new Date(createdAt)
    const time: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    }
    if (LOG_RANGE_MS[range] <= DAY_MS) return date.toLocaleTimeString(LOCALE, time)

    return date.toLocaleString(LOCALE, { month: 'short', day: 'numeric', ...time })
}
