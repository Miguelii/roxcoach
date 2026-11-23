import type { SyncStatus } from '@/_bff/core/constants/sync.constants'
import { SYNC_POLL_INTERVAL_MS } from '@/lib/constants'

export type SyncSnapshot = { status: SyncStatus; startedAt: string | null }

export function pollWhileSyncing(data?: { sync: SyncSnapshot }): number | false {
    return data?.sync.status === 'running' ? SYNC_POLL_INTERVAL_MS : false
}

// The mutation answers `...Z` and the database `...+00:00`: the same instant has two spellings.
export function sameRun(a: string | null, b: string | null): boolean {
    if (a === null || b === null) return false
    return a === b || Date.parse(a) === Date.parse(b)
}

// A run counts as finished only for the tab that saw it running or started it, so a page loaded
// after the sync ended does not announce it again.
export function finishedSync(seenRunningAt: string | null, current: SyncSnapshot): boolean {
    return (
        sameRun(seenRunningAt, current.startedAt) &&
        (current.status === 'succeeded' || current.status === 'failed')
    )
}
