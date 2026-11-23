// Safety ceiling of Lyfta pages one sync run fetches (100 workouts per page), not a working limit.
export const MAX_PAGES_PER_SYNC = 200

// The first sync (and a very old checkpoint) reaches back this many UTC days, no further.
export const SYNC_HISTORY_DAYS = 360

// Size of one sync window in UTC calendar days, both ends included. Windows run oldest first.
export const SYNC_WINDOW_DAYS = 90

export const LYFTA_SYNC_TASK_ID = 'sync-lyfta-workouts'
