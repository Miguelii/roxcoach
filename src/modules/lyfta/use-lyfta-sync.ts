'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
    LYFTA_SYNC_IN_PROGRESS_MESSAGE,
    type LyftaSyncResult,
} from '@/_bff/core/constants/lyfta.constants'
import type { SyncState } from '@/_bff/core/helpers/sync-state.helper'
import { useSyncCompletion } from '@/hooks/use-sync-completion'
import { useTRPC } from '@/lib/trpc'
import { formatDateTime } from '@/lib/formatters'
import { messageForLyftaError } from '@/modules/lyfta/lyfta-ui.utils'

type Options = {
    sync?: SyncState<LyftaSyncResult>
    onStarted?: () => void
    onInProgress?: (message: string) => void
    onSynced?: (result: LyftaSyncResult) => void
    onFailed?: (message: string) => void
}

const REFRESH_FAILED_MESSAGE =
    'Sync completed, but some data could not refresh. Reload to see the latest history.'

export function useLyftaSync({ sync, onStarted, onInProgress, onSynced, onFailed }: Options = {}) {
    const trpc = useTRPC()
    const syncMutation = useMutation(trpc.lyfta.syncWorkouts.mutationOptions())
    const queryClient = useQueryClient()
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [starting, setStarting] = useState(false)
    const [startedRunAt, setStartedRunAt] = useState<string | null>(null)
    // The run whose stored result or error the athlete dismissed (undefined: none dismissed yet).
    const [dismissedRunAt, setDismissedRunAt] = useState<string | null>()

    const refreshTraining = async () => {
        try {
            await Promise.all([
                queryClient.invalidateQueries(trpc.lyfta.getActivityCount.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getStrengthProgress.queryFilter()),
            ])
        } catch {
            setErrorMessage(REFRESH_FAILED_MESSAGE)
            onFailed?.(REFRESH_FAILED_MESSAGE)
        }
    }

    useSyncCompletion(
        sync,
        (finished) => {
            if (finished.status === 'succeeded' && finished.result) onSynced?.(finished.result)
            if (finished.status === 'failed') {
                onFailed?.(messageForLyftaError({ message: finished.errorCode ?? '' }))
            }
            void refreshTraining()
        },
        startedRunAt
    )

    const syncWorkouts = async () => {
        setErrorMessage(null)
        setDismissedRunAt(sync?.startedAt ?? null)
        setStarting(true)
        try {
            try {
                const { startedAt } = await syncMutation.mutateAsync()
                setStartedRunAt(startedAt)
                onStarted?.()
            } catch (error) {
                const message = messageForLyftaError({
                    message: error instanceof Error ? error.message : '',
                })
                if (message === LYFTA_SYNC_IN_PROGRESS_MESSAGE) onInProgress?.(message)
                else {
                    setErrorMessage(message)
                    onFailed?.(message)
                }
            }
            syncMutation.reset()
            await queryClient.invalidateQueries(trpc.lyfta.getConnectionStatus.queryFilter())
        } finally {
            setStarting(false)
        }
    }

    const lastRun =
        sync && sync.status !== 'running' && sync.startedAt !== dismissedRunAt ? sync : null
    const lastRunError =
        lastRun?.status === 'failed'
            ? messageForLyftaError({ message: lastRun.errorCode ?? '' })
            : null

    return {
        errorMessage: errorMessage ?? lastRunError,
        formatTimestamp: formatDateTime,
        isSyncing: starting || syncMutation.isPending || sync?.status === 'running',
        syncResult: lastRun?.status === 'succeeded' ? lastRun.result : null,
        syncWorkouts,
        clearError: () => {
            setErrorMessage(null)
            if (sync?.status === 'failed') setDismissedRunAt(sync.startedAt)
        },
        clearResult: () => {
            if (sync?.status === 'succeeded') setDismissedRunAt(sync.startedAt)
        },
    }
}
