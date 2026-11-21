'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import { formatDateTime } from '@/lib/formatters'
import { messageForLyftaError } from '@/modules/lyfta/lyfta-ui.utils'

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
    const trpc = useTRPC()
    const syncMutation = useMutation(trpc.lyfta.syncWorkouts.mutationOptions())
    const queryClient = useQueryClient()
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
                queryClient.invalidateQueries(trpc.lyfta.getConnectionStatus.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getStrengthProgress.queryFilter()),
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
        formatTimestamp: formatDateTime,
        isSyncing: syncMutation.isPending,
        syncResult,
        syncWorkouts,
        clearError: () => setErrorMessage(null),
        clearResult: () => setSyncResult(null),
    }
}
