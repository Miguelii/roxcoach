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
