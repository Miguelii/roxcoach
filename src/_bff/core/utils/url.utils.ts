const DEFAULT_WEBSITE_URL = 'http://localhost:3000'

/** Returns the website url without a trailing slash, defaulting to the local dev url. */
export function normalizeWebsiteUrl(url: string = DEFAULT_WEBSITE_URL): string {
    return url.endsWith('/') ? url.slice(0, -1) : url
}
