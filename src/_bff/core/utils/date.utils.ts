// `en-CA` formats dates as YYYY-MM-DD, so no manual assembly of the parts is needed.
const formatters = new Map<string, Intl.DateTimeFormat>()

const getFormatter = (timezone: string) => {
    const cached = formatters.get(timezone)
    if (cached) return cached
    const created = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    formatters.set(timezone, created)
    return created
}

/** The calendar date (`YYYY-MM-DD`) of `now` in the given IANA timezone. */
export const todayIn = (timezone: string, now: Date = new Date()) =>
    getFormatter(timezone).format(now)

/** The calendar date (`YYYY-MM-DD`) of an ISO instant in the given IANA timezone. */
export const localDateIn = (isoInstant: string, timezone: string) =>
    getFormatter(timezone).format(new Date(isoInstant))

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

// The first instant (ms) whose local date in `timezone` is `localDate` or later. The local date
// never goes backwards as the instant grows, so a binary search finds it. The bracket is wider
// than any real offset (UTC-12 to UTC+14), so the start is always inside it.
const startOfLocalDayMs = (localDate: string, timezone: string) => {
    const utcMidnight = Date.parse(`${localDate}T00:00:00Z`)
    let low = utcMidnight - 15 * HOUR_MS
    let high = utcMidnight + 15 * HOUR_MS
    while (high - low > 1) {
        const middle = Math.floor((low + high) / 2)
        if (getFormatter(timezone).format(new Date(middle)) >= localDate) high = middle
        else low = middle
    }
    return high
}

/**
 * The UTC instants (ISO strings) of the start of the local day `localDate` (`YYYY-MM-DD`) and of
 * the start of the next local day in `timezone`: the half-open interval [fromIso, toIso). DST-safe:
 * the instants come from the zone rules, so a day can be 23 or 25 hours long.
 */
export const localDayBoundsUtc = (localDate: string, timezone: string) => {
    const nextDate = new Date(Date.parse(`${localDate}T00:00:00Z`) + DAY_MS)
        .toISOString()
        .slice(0, 10)
    return {
        fromIso: new Date(startOfLocalDayMs(localDate, timezone)).toISOString(),
        toIso: new Date(startOfLocalDayMs(nextDate, timezone)).toISOString(),
    }
}
