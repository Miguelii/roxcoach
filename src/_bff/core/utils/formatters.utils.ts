/** Formats seconds as `1h 05m`, `45m` or `38s`. Returns null for missing values. */
export const formatDuration = (seconds: number | null | undefined) => {
    if (seconds == null) return null
    const total = Math.round(seconds)
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)

    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
    if (minutes > 0) return `${minutes}m`
    return `${total}s`
}

/** Formats seconds as a clock: `1:10:00` or `39:59`. Returns null for missing values. */
export const formatClock = (seconds: number | null | undefined) => {
    if (seconds == null) return null
    const total = Math.round(seconds)
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const secs = total % 60
    const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0')
    const ss = String(secs).padStart(2, '0')

    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Formats meters per second as a running pace, `4:55 /km`. */
export const formatPace = (metersPerSecond: number | null | undefined) => {
    if (!metersPerSecond || metersPerSecond <= 0) return null
    return `${formatClock(1000 / metersPerSecond)} /km`
}

/** Formats meters as kilometers with one decimal, `10.2 km`. */
export const formatKm = (meters: number | null | undefined) => {
    if (meters == null) return null
    return `${(meters / 1000).toFixed(1)} km`
}

/**
 * Parses `h:mm:ss`, `mm:ss` or plain minutes into seconds.
 * Returns null when the text is not a valid duration.
 */
export const parseClock = (text: string) => {
    const value = text.trim()
    if (/^\d+$/u.test(value)) return Number(value) * 60

    const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/u.exec(value)
    if (!match) return null

    const [, hours = '0', minutes = '0', seconds = '0'] = match
    if (Number(seconds) > 59) return null
    // Minutes above 59 are only valid without hours (`90:00`), never in `1:75:00`.
    if (match[1] !== undefined && Number(minutes) > 59) return null

    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}
