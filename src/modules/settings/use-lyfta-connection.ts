'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpcClient } from '@/lib/trpc'
import { formatLyftaTimestamp, messageForLyftaError } from '@/modules/lyfta/lyfta-ui.utils'
import { useLyftaSync } from '@/modules/lyfta/use-lyfta-sync'

export type LyftaFormValues = z.infer<typeof lyftaFormSchema>

const lyftaFormSchema = z.object({
    apiKey: z
        .string()
        .min(1, 'Enter your Lyfta API key')
        .refine((value) => value.trim().length > 0),
})

export function useLyftaConnection() {
    const query = trpcClient.lyfta.getConnectionStatus.useQuery()
    const utils = trpcClient.useUtils()
    const connectMutation = trpcClient.lyfta.connect.useMutation({ gcTime: 0 })
    const disconnectMutation = trpcClient.lyfta.disconnect.useMutation()
    const lyftaSync = useLyftaSync()
    const form = useForm<LyftaFormValues>({
        resolver: zodResolver(lyftaFormSchema),
        defaultValues: { apiKey: '' },
    })
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [showKeyForm, setShowKeyForm] = useState(false)
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)

    const refreshStatus = async () => {
        try {
            await utils.lyfta.getConnectionStatus.invalidate()
        } catch {
            setErrorMessage('Your change was saved, but some data could not refresh.')
        }
    }

    const submitApiKey = form.handleSubmit(async ({ apiKey }) => {
        setErrorMessage(null)
        lyftaSync.clearError()
        try {
            await connectMutation.mutateAsync({ apiKey })
        } catch (error) {
            setErrorMessage(
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
        setErrorMessage(null)
        await lyftaSync.syncWorkouts()
    }

    const disconnect = async () => {
        setErrorMessage(null)
        lyftaSync.clearError()
        try {
            await disconnectMutation.mutateAsync()
        } catch (error) {
            setErrorMessage(
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
        errorMessage: errorMessage ?? lyftaSync.errorMessage,
        syncResult: lyftaSync.syncResult,
        showKeyForm,
        confirmDisconnect,
        isConnecting: form.formState.isSubmitting || connectMutation.isPending,
        isSyncing: lyftaSync.isSyncing,
        isDisconnecting: disconnectMutation.isPending,
        submitApiKey,
        syncWorkouts,
        disconnect,
        setShowKeyForm,
        setConfirmDisconnect,
        clearError: () => {
            setErrorMessage(null)
            lyftaSync.clearError()
        },
        formatTimestamp: formatLyftaTimestamp,
    }
}
