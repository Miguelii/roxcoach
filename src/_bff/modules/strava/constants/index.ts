export const STRAVA_API_BASE = 'https://www.strava.com/api/v3'
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
// Refresh the access token when it expires in less than this many seconds.
export const TOKEN_REFRESH_MARGIN_S = 600
// Pause between two activities of a bulk sync, to stay under the Strava rate limit.
export const SYNC_ITEM_DELAY_MS = 250
export const ACTIVITIES_PER_PAGE = 100

export const STRAVA_JOB_IDS = {
    syncActivity: 'sync-strava-activity',
    verifyDeauthorization: 'verify-strava-deauthorization',
    backfill: 'backfill-strava',
    syncMissing: 'sync-missing-strava',
} as const
// The backfill and a never-synced manual sync look back this far (12 months).
export const BACKFILL_WINDOW_S = 365 * 24 * 60 * 60
// Strava limits are per 15-minute window: a rate-limited job without a Retry-After waits this long.
export const RATE_LIMIT_RETRY_FLOOR_S = 15 * 60
