const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

// "Nov 21, 2026, 10:00 AM" in the browser timezone, "Unknown" for a value that is not a date.
export const formatDateTime = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleString('en-US', DATE_TIME_FORMAT)
}
