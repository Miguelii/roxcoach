export const SYNC_STATUSES = ['idle', 'running', 'succeeded', 'failed'] as const

export type SyncStatus = (typeof SYNC_STATUSES)[number]

// A running sync older than this is treated as dead (the run crashed without finishing).
export const SYNC_LEASE_STALE_MS = 20 * 60 * 1000

export const SYNC_TASK_MAX_DURATION_S = 900

export const SYNC_START_MESSAGE = 'Syncing your activities. They will be available shortly.'
