'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import { zeppSyncResultSchema, type ZeppSyncResult } from '@/_bff/core/constants/zepp.constants'
import { messageForZeppError, zeppSyncMessage } from '@/modules/zepp/zepp-ui.utils'

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
        let started: unknown
        try {
            started = await syncMutation.mutateAsync()
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
        // TODO(task 9): the mutation now returns { startedAt }; the client is reworked to poll the status.
        const parsed = zeppSyncResultSchema.safeParse(started)
        if (parsed.success) {
            setSyncMessage(zeppSyncMessage(parsed.data))
            onSynced?.(parsed.data)
        }
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
