export const LOG_RANGES = ['30m', '1h', '24h', '7d', '30d'] as const

export type LogRange = (typeof LOG_RANGES)[number]

export const DEFAULT_LOG_RANGE: LogRange = '1h'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export const LOG_RANGE_MS: Record<LogRange, number> = {
    '30m': 30 * MINUTE_MS,
    '1h': HOUR_MS,
    '24h': DAY_MS,
    '7d': 7 * DAY_MS,
    '30d': 30 * DAY_MS,
}

// Rows per request: the page filters, counts and charts them in the browser.
export const LOGS_FETCH_LIMIT = 1000

// Most severe first: the order of the level facets and of the stacked histogram series.
const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

type LogJson = string | number | boolean | null | LogJson[] | { [key: string]: LogJson }

type LogMetadata = { [key: string]: LogJson }

export type LogEntry = {
    id: string
    created_at: string
    level: LogLevel
    prefix: string
    message: string | null
    metadata: LogMetadata | null
    user_id: string | null
}
