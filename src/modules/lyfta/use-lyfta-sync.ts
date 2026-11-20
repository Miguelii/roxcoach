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

type Options = {
    // Extra reactions to a finished sync (the dashboard button shows toasts).
    onSynced?: (result: SyncResult) => void
    onFailed?: (message: string) => void
}

export function useLyftaSync({ onSynced, onFailed }: Options = {}) {
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
            const message = messageForLyftaError({
                message: error instanceof Error ? error.message : '',
            })
            setErrorMessage(message)
            syncMutation.reset()
            onFailed?.(message)
            return
        }

        syncMutation.reset()
        setSyncResult(result)
        onSynced?.(result)
        try {
            await Promise.all([
                utils.lyfta.getConnectionStatus.invalidate(),
                utils.training.getCalendar.invalidate(),
            ])
        } catch {
            const message =
                'Sync completed, but some data could not refresh. Reload to see the latest history.'
            setErrorMessage(message)
            onFailed?.(message)
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
