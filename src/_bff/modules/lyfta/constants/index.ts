// Lyfta pages processed by one sync run (100 workouts per page). A longer history needs more runs.
export const MAX_PAGES_PER_SYNC = 20

// A sync lease older than this is stale (the run that took it died), so another sync may take it.
export const SYNC_LEASE_STALE_MS = 5 * 60 * 1000

// The first sync (and a very old checkpoint) reaches back this many UTC days, no further.
export const SYNC_HISTORY_DAYS = 360

// Size of one sync window in UTC calendar days, both ends included. Windows run oldest first.
export const SYNC_WINDOW_DAYS = 90

// After this much time a sync stops starting new workouts (the route allows 60 s).
export const SYNC_TIME_BUDGET_MS = 40_000
