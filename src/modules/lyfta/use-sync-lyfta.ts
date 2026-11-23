'use client'

import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { SYNC_START_MESSAGE } from '@/_bff/core/constants/sync.constants'
import { useTRPC } from '@/lib/trpc'
import type { SyncSource } from '@/lib/sync-source'
import { pollWhileSyncing } from '@/lib/sync-state'
import { LYFTA_MORE_TO_SYNC_MESSAGE } from '@/modules/lyfta/lyfta-ui.utils'
import { useLyftaSync } from '@/modules/lyfta/use-lyfta-sync'

// Lyfta for the shared Sync button. Everything it has to say goes through toasts, like the
// activity upload.
export function useSyncLyfta(): SyncSource {
    const trpc = useTRPC()
    const connection = useQuery(
        trpc.lyfta.getConnectionStatus.queryOptions(undefined, {
            refetchInterval: (query) => pollWhileSyncing(query.state.data),
        })
    )
    const lyfta = useLyftaSync({
        sync: connection.data?.sync,
        onStarted: () => toast.info(SYNC_START_MESSAGE),
        onInProgress: (message) => toast.info(message),
        onSynced: (result) => {
            const summary = `${result.created} workouts added and ${result.updated} updated.`
            if (result.hasMore) toast.info(`${summary} ${LYFTA_MORE_TO_SYNC_MESSAGE}`)
            else toast.success(`Lyfta synced: ${summary}`)
        },
        onFailed: (message) => toast.error(message),
    })

    let status: SyncSource['status'] = 'loading'
    if (connection.isError) status = 'error'
    else if (!connection.isPending && connection.data)
        status = connection.data.connected ? 'connected' : 'disconnected'

    return {
        id: 'lyfta',
        name: 'Lyfta',
        status,
        lastSyncedAt: connection.data?.lastSyncedAt || null,
        isSyncing: lyfta.isSyncing,
        sync: lyfta.syncWorkouts,
    }
}
