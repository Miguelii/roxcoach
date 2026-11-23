'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
    ZEPP_SYNC_IN_PROGRESS_MESSAGE,
    type ZeppSyncResult,
} from '@/_bff/core/constants/zepp.constants'
import type { SyncState } from '@/_bff/core/helpers/sync-state.helper'
import { useSyncCompletion } from '@/hooks/use-sync-completion'
import { useTRPC } from '@/lib/trpc'
import { messageForZeppError, zeppSyncMessage } from '@/modules/zepp/zepp-ui.utils'

type Options = {
    sync?: SyncState<ZeppSyncResult>
    onStarted?: () => void
    onInProgress?: (message: string) => void
    onSynced?: (result: ZeppSyncResult) => void
    onFailed?: (message: string) => void
}

export function useZeppSync({ sync, onStarted, onInProgress, onSynced, onFailed }: Options = {}) {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const syncMutation = useMutation(trpc.zepp.syncActivities.mutationOptions())
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [starting, setStarting] = useState(false)
    const [startedRunAt, setStartedRunAt] = useState<string | null>(null)
    // The run whose stored result or error the athlete dismissed (undefined: none dismissed yet).
    const [dismissedRunAt, setDismissedRunAt] = useState<string | null>()

    useSyncCompletion(
        sync,
        (finished) => {
            if (finished.status === 'succeeded' && finished.result) onSynced?.(finished.result)
            if (finished.status === 'failed') {
                onFailed?.(messageForZeppError({ message: finished.errorCode ?? '' }))
            }
            void Promise.all([
                queryClient.invalidateQueries(trpc.zepp.getActivityCount.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getRunProgress.queryFilter()),
            ])
        },
        startedRunAt
    )

    const startSync = async () => {
        setErrorMessage(null)
        setDismissedRunAt(sync?.startedAt ?? null)
        setStarting(true)
        try {
            try {
                const { startedAt } = await syncMutation.mutateAsync()
                setStartedRunAt(startedAt)
                onStarted?.()
            } catch (error) {
                const message = messageForZeppError({
                    message: error instanceof Error ? error.message : '',
                })
                if (message === ZEPP_SYNC_IN_PROGRESS_MESSAGE) onInProgress?.(message)
                else {
                    setErrorMessage(message)
                    onFailed?.(message)
                }
            }
            syncMutation.reset()
            await queryClient.invalidateQueries(trpc.zepp.getConnectionStatus.queryFilter())
        } finally {
            setStarting(false)
        }
    }

    const lastRun =
        sync && sync.status !== 'running' && sync.startedAt !== dismissedRunAt ? sync : null
    const lastRunError =
        lastRun?.status === 'failed'
            ? messageForZeppError({ message: lastRun.errorCode ?? '' })
            : null
    const lastRunResult = lastRun?.status === 'succeeded' ? lastRun.result : null

    return {
        errorMessage: errorMessage ?? lastRunError,
        syncMessage: lastRunResult ? zeppSyncMessage(lastRunResult) : null,
        isSyncing: starting || syncMutation.isPending || sync?.status === 'running',
        sync: startSync,
        clearError: () => {
            setErrorMessage(null)
            if (sync?.status === 'failed') setDismissedRunAt(sync.startedAt)
        },
        clearMessage: () => {
            if (sync?.status === 'succeeded') setDismissedRunAt(sync.startedAt)
        },
    }
}
