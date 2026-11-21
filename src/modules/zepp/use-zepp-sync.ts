'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import {
    messageForZeppError,
    zeppSyncMessage,
    type ZeppSyncResult,
} from '@/modules/zepp/zepp-ui.utils'

type Options = {
    // Extra reactions to a finished sync (the shared Sync button shows toasts).
    onSynced?: (result: ZeppSyncResult) => void
    onFailed?: (message: string) => void
}

export function useZeppSync({ onSynced, onFailed }: Options = {}) {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const syncMutation = useMutation(trpc.zepp.syncActivities.mutationOptions())
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [syncMessage, setSyncMessage] = useState<string | null>(null)

    const sync = async () => {
        setErrorMessage(null)
        setSyncMessage(null)
        let result: ZeppSyncResult
        try {
            result = await syncMutation.mutateAsync()
        } catch (error) {
            const message = messageForZeppError({
                message: error instanceof Error ? error.message : '',
            })
            setErrorMessage(message)
            syncMutation.reset()
            onFailed?.(message)
            return
        }

        syncMutation.reset()
        setSyncMessage(zeppSyncMessage(result))
        onSynced?.(result)
        await Promise.all([
            queryClient.invalidateQueries(trpc.zepp.getConnectionStatus.queryFilter()),
            queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter()),
            queryClient.invalidateQueries(trpc.training.getRunProgress.queryFilter()),
        ])
    }

    return {
        errorMessage,
        syncMessage,
        isSyncing: syncMutation.isPending,
        sync,
        clearError: () => setErrorMessage(null),
        clearMessage: () => setSyncMessage(null),
    }
}
