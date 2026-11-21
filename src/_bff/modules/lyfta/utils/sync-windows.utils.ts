import { SYNC_HISTORY_DAYS, SYNC_WINDOW_DAYS } from '@/_bff/modules/lyfta/constants'

type SyncWindow = {
    from: string
    to: string
    isLast: boolean
}

const DAY_MS = 86_400_000

const utcDate = (date: Date): string => date.toISOString().slice(0, 10)

/** `YYYY-MM-DD` plus `days` calendar days (negative allowed), in UTC. */
export const addUtcDays = (date: string, days: number): string =>
    utcDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS))

/**
 * The first UTC day a sync must read. No checkpoint: today minus SYNC_HISTORY_DAYS. A checkpoint:
 * its UTC day minus one (overlap), never earlier than that same floor.
 * @throws when the checkpoint or `now` is not a valid instant, or the checkpoint is in the future.
 */
export const getLyftaSyncStart = (lastSyncedAt: string | null, now: Date): string => {
    if (Number.isNaN(now.getTime())) throw new TypeError('Invalid Lyfta sync clock')
    const today = utcDate(now)
    const floor = addUtcDays(today, -SYNC_HISTORY_DAYS)
    if (lastSyncedAt === null) return floor

    const checkpoint = new Date(lastSyncedAt)
    if (Number.isNaN(checkpoint.getTime())) throw new TypeError('Invalid Lyfta sync timestamp')
    const from = addUtcDays(utcDate(checkpoint), -1)
    if (from > today) throw new Error('Lyfta sync checkpoint is in the future')
    return from > floor ? from : floor
}

/** The window of SYNC_WINDOW_DAYS days starting at `from`, cut at `today` (bounds inclusive). */
export const getLyftaSyncWindow = (from: string, today: string): SyncWindow => {
    const end = addUtcDays(from, SYNC_WINDOW_DAYS - 1)
    const to = end < today ? end : today
    return { from, to, isLast: to === today }
}
