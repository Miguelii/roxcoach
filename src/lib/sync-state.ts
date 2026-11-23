import type { SyncStatus } from '@/_bff/core/constants/sync.constants'
import { SYNC_POLL_INTERVAL_MS } from '@/lib/constants'

export type SyncSnapshot = { status: SyncStatus; startedAt: string | null }

export function pollWhileSyncing(data?: { sync: SyncSnapshot }): number | false {
    return data?.sync.status === 'running' ? SYNC_POLL_INTERVAL_MS : false
}

// A run counts as finished only for the tab that saw it running, so a page loaded after the sync
// ended does not announce it again.
export function finishedSync(seenRunningAt: string | null, current: SyncSnapshot): boolean {
    return (
        seenRunningAt !== null &&
        seenRunningAt === current.startedAt &&
        (current.status === 'succeeded' || current.status === 'failed')
    )
}
