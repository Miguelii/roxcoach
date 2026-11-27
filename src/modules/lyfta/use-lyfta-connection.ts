'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SYNC_START_MESSAGE } from '@/_bff/core/constants/sync.constants'
import { useTRPC } from '@/lib/trpc'
import { formatDateTime } from '@/lib/formatters'
import { pollWhileSyncing } from '@/lib/sync-state'
import { messageForLyftaError } from '@/modules/lyfta/lyfta-ui.utils'
import { useClearLyftaActivities } from '@/modules/lyfta/use-clear-lyfta-activities'
import { useLyftaSync } from '@/modules/lyfta/use-lyfta-sync'

export type LyftaFormValues = z.infer<typeof lyftaFormSchema>

const lyftaFormSchema = z.object({
    apiKey: z
        .string()
        .min(1, 'Enter your Lyfta API key')
        .refine((value) => value.trim().length > 0),
})

const SYNC_ERROR_TOAST_ID = 'lyfta-sync-error'

export function useLyftaConnection() {
    const trpc = useTRPC()
    const query = useQuery(
        trpc.lyfta.getConnectionStatus.queryOptions(undefined, {
            refetchInterval: (current) => pollWhileSyncing(current.state.data),
            meta: { errorMessage: 'Could not load your Lyfta connection.' },
        })
    )
    const countQuery = useQuery(trpc.lyfta.getActivityCount.queryOptions())
    const clearActivities = useClearLyftaActivities()
    const queryClient = useQueryClient()
    const connectMutation = useMutation(trpc.lyfta.connect.mutationOptions({ gcTime: 0 }))
    const disconnectMutation = useMutation(trpc.lyfta.disconnect.mutationOptions())
    const lyftaSync = useLyftaSync({
        sync: query.data?.sync,
        onStarted: () => toast.info(SYNC_START_MESSAGE),
        onInProgress: (message) => toast.info(message),
        onFailed: (message) => toast.error(message, { id: SYNC_ERROR_TOAST_ID }),
    })
    const form = useForm<LyftaFormValues>({
        resolver: zodResolver(lyftaFormSchema),
        defaultValues: { apiKey: '' },
    })
    // The failure of the last stored run (a sync that ended while the page was closed) is toasted
    // once; a fresh failure shares the id, so it is not toasted twice.
    const syncError = lyftaSync.errorMessage
    useEffect(() => {
        if (syncError) toast.error(syncError, { id: SYNC_ERROR_TOAST_ID })
    }, [syncError])
    const [showKeyForm, setShowKeyForm] = useState(false)
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)

    const refreshStatus = async () => {
        try {
            await queryClient.invalidateQueries(trpc.lyfta.getConnectionStatus.queryFilter())
        } catch {
            toast.error('Your change was saved, but some data could not refresh.')
        }
    }

    const submitApiKey = form.handleSubmit(async ({ apiKey }) => {
        lyftaSync.clearError()
        try {
            await connectMutation.mutateAsync({ apiKey })
        } catch (error) {
            toast.error(
                messageForLyftaError({ message: error instanceof Error ? error.message : '' })
            )
            connectMutation.reset()
            return
        }

        connectMutation.reset()
        form.reset({ apiKey: '' })
        setShowKeyForm(false)
        lyftaSync.clearResult()
        await refreshStatus()
    })

    const syncWorkouts = async () => {
        await lyftaSync.syncWorkouts()
    }

    const disconnect = async () => {
        lyftaSync.clearError()
        try {
            await disconnectMutation.mutateAsync()
        } catch (error) {
            toast.error(
                messageForLyftaError({ message: error instanceof Error ? error.message : '' })
            )
            disconnectMutation.reset()
            return
        }

        disconnectMutation.reset()
        setConfirmDisconnect(false)
        setShowKeyForm(false)
        form.reset({ apiKey: '' })
        lyftaSync.clearResult()
        await refreshStatus()
    }

    return {
        query,
        form,
        syncResult: lyftaSync.syncResult,
        showKeyForm,
        confirmDisconnect,
        isConnecting: form.formState.isSubmitting || connectMutation.isPending,
        isSyncing: lyftaSync.isSyncing,
        isDisconnecting: disconnectMutation.isPending,
        activityCount: countQuery.data?.count,
        clearActivities,
        submitApiKey,
        syncWorkouts,
        disconnect,
        setShowKeyForm,
        setConfirmDisconnect,
        clearError: lyftaSync.clearError,
        formatTimestamp: formatDateTime,
    }
}
