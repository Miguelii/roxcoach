export type StravaResult = 'connected' | 'denied' | 'scope' | 'error'

const RESULTS: readonly StravaResult[] = ['connected', 'denied', 'scope', 'error']

/** Narrows the `strava` query value from the OAuth callback; anything else is ignored. */
export function parseStravaResult(value: string | string[] | undefined): StravaResult | undefined {
    return RESULTS.find((result) => result === value)
}
