'use client'

import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import type { SyncSource } from '@/lib/sync-source'
import { useZeppSync } from '@/modules/zepp/use-zepp-sync'
import { zeppSyncMessage } from '@/modules/zepp/zepp-ui.utils'

// Zepp for the shared Sync button. Everything it has to say goes through toasts.
export function useSyncZepp(): SyncSource {
    const trpc = useTRPC()
    const connection = useQuery(trpc.zepp.getConnectionStatus.queryOptions())
    const zepp = useZeppSync({
        onSynced: (result) => {
            const message = zeppSyncMessage(result)
            if (result.remaining > 0) toast.info(message)
            else toast.success(`Zepp synced: ${message}`)
        },
        onFailed: (message) => toast.error(message),
    })

    let status: SyncSource['status'] = 'loading'
    if (connection.isError) status = 'error'
    else if (!connection.isPending && connection.data)
        status = connection.data.connected ? 'connected' : 'disconnected'

    return {
        id: 'zepp',
        name: 'Zepp',
        status,
        lastSyncedAt: connection.data?.lastSyncedAt ?? null,
        isSyncing: zepp.isSyncing,
        sync: zepp.sync,
    }
}
