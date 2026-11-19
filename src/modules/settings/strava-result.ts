export type StravaResult = 'connected' | 'denied' | 'scope' | 'error'

const RESULTS: readonly StravaResult[] = ['connected', 'denied', 'scope', 'error']

/** Narrows the `strava` query value from the OAuth callback; anything else is ignored. */
export function parseStravaResult(value: string | string[] | undefined): StravaResult | undefined {
    return RESULTS.find((result) => result === value)
}

const STRAVA_ORIGIN = 'https://www.strava.com'

/** True only for an absolute url on https://www.strava.com; the connect redirect never leaves it. */
export function isStravaUrl(url: string): boolean {
    try {
        return new URL(url).origin === STRAVA_ORIGIN
    } catch {
        return false
    }
}
