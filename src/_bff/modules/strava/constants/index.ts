export const STRAVA_API_BASE = 'https://www.strava.com/api/v3'
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
// Refresh the access token when it expires in less than this many seconds.
export const TOKEN_REFRESH_MARGIN_S = 600
// Pause between two activities of a bulk sync, to stay under the Strava rate limit.
export const SYNC_ITEM_DELAY_MS = 250
export const ACTIVITIES_PER_PAGE = 100
