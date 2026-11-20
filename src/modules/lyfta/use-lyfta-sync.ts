'use client'

import { useState } from 'react'
import { trpcClient } from '@/lib/trpc'
import { formatLyftaTimestamp, messageForLyftaError } from '@/modules/lyfta/lyfta-ui.utils'

type SyncResult = {
    created: number
    updated: number
    lastSyncedAt: string | null
    hasMore: boolean
}

export function useLyftaSync() {
    const syncMutation = trpcClient.lyfta.syncWorkouts.useMutation()
    const utils = trpcClient.useUtils()
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

    const syncWorkouts = async () => {
        setErrorMessage(null)
        setSyncResult(null)
        let result: SyncResult
        try {
            result = await syncMutation.mutateAsync()
        } catch (error) {
            setErrorMessage(
                messageForLyftaError({ message: error instanceof Error ? error.message : '' })
            )
            syncMutation.reset()
            return
        }

        syncMutation.reset()
        setSyncResult(result)
        try {
            await Promise.all([
                utils.lyfta.getConnectionStatus.invalidate(),
                utils.training.getCalendar.invalidate(),
            ])
        } catch {
            setErrorMessage(
                'Sync completed, but some data could not refresh. Reload to see the latest history.'
            )
        }
    }

    return {
        errorMessage,
        formatTimestamp: formatLyftaTimestamp,
        isSyncing: syncMutation.isPending,
        syncResult,
        syncWorkouts,
        clearError: () => setErrorMessage(null),
        clearResult: () => setSyncResult(null),
    }
}
