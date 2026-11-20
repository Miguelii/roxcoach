export const DAY_MS = 86_400_000

export const parseIsoDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

export const formatIsoDate = (date: Date) => date.toISOString().slice(0, 10)

/** Adds whole days to an ISO date (`YYYY-MM-DD`). */
export const addDays = (iso: string, days: number) =>
    formatIsoDate(new Date(parseIsoDate(iso).getTime() + days * DAY_MS))

/** ISO weekday, 1 = Monday to 7 = Sunday. */
export const isoWeekday = (iso: string) => parseIsoDate(iso).getUTCDay() || 7

export const startOfWeek = (iso: string) => addDays(iso, 1 - isoWeekday(iso))
