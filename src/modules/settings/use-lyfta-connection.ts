'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { trpcClient } from '@/lib/trpc'

export type LyftaFormValues = z.infer<typeof lyftaFormSchema>

const lyftaFormSchema = z.object({
    apiKey: z
        .string()
        .min(1, 'Enter your Lyfta API key')
        .refine((value) => value.trim().length > 0),
})

const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
    [ErrorCode.LYFTA_CREDENTIAL]: 'Lyfta did not accept this API key. Check it and try again.',
    [ErrorCode.LYFTA_RATE_LIMIT]: 'Lyfta is rate limiting requests. Wait before trying again.',
    [ErrorCode.LYFTA_API_REQUEST]: 'Could not reach Lyfta. Check your connection and try again.',
    [ErrorCode.LYFTA_API_RESPONSE]: 'Lyfta could not complete the request. Try again later.',
    [ErrorCode.LYFTA_CONNECTION_WRITE]: 'Could not save your Lyfta connection. Try again.',
    [ErrorCode.LYFTA_CONNECTION_QUERY]: 'Could not load your Lyfta connection. Try again.',
    [ErrorCode.LYFTA_CHECKPOINT]: 'Could not save the sync time. Try syncing again.',
    [ErrorCode.LYFTA_CONFIGURATION]: 'Lyfta is not configured on the server. Contact support.',
    [ErrorCode.LYFTA_NO_CONNECTION]: 'Connect Lyfta before syncing workouts.',
    [ErrorCode.LYFTA_IMPORT]: 'Could not save imported workouts. Try syncing again.',
    [ErrorCode.TRAINING_LYFTA_ACTIVITY_SELECT_ERR]:
        'Could not load your training history. Try syncing again.',
    [ErrorCode.TRAINING_LYFTA_ACTIVITY_UPSERT_ERR]:
        'Could not save imported workouts. Try syncing again.',
    [ErrorCode.TRAINING_STRENGTH_SETS_DELETE_ERR]:
        'Could not replace imported sets. Try syncing again.',
    [ErrorCode.TRAINING_STRENGTH_SETS_INSERT_ERR]:
        'Could not save imported sets. Try syncing again.',
}

const messageForError = (error: Error): string =>
    Object.entries(ERROR_MESSAGES).find(([code]) => code === error.message)?.[1] ??
    'Lyfta could not complete the request. Try again.'

const GENERIC_ERROR_MESSAGE = 'Lyfta could not complete the request. Try again.'

const formatTimestamp = (value: string): string => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export function useLyftaConnection() {
    const query = trpcClient.lyfta.getConnectionStatus.useQuery()
    const utils = trpcClient.useUtils()
    const connectMutation = trpcClient.lyfta.connect.useMutation({ gcTime: 0 })
    const syncMutation = trpcClient.lyfta.syncWorkouts.useMutation()
    const disconnectMutation = trpcClient.lyfta.disconnect.useMutation()
    const form = useForm<LyftaFormValues>({
        resolver: zodResolver(lyftaFormSchema),
        defaultValues: { apiKey: '' },
    })
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [syncResult, setSyncResult] = useState<{
        created: number
        updated: number
        lastSyncedAt: string
    } | null>(null)
    const [showKeyForm, setShowKeyForm] = useState(false)
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)

    const refreshStatus = async (includeCalendar = false) => {
        try {
            const invalidations = [utils.lyfta.getConnectionStatus.invalidate()]
            if (includeCalendar) invalidations.push(utils.training.getCalendar.invalidate())
            await Promise.all(invalidations)
        } catch {
            setErrorMessage('Your change was saved, but some data could not refresh.')
        }
    }

    const submitApiKey = form.handleSubmit(async ({ apiKey }) => {
        setErrorMessage(null)
        try {
            await connectMutation.mutateAsync({ apiKey })
        } catch (error) {
            setErrorMessage(error instanceof Error ? messageForError(error) : GENERIC_ERROR_MESSAGE)
            connectMutation.reset()
            return
        }

        connectMutation.reset()
        form.reset({ apiKey: '' })
        setShowKeyForm(false)
        setSyncResult(null)
        await refreshStatus()
    })

    const syncWorkouts = async () => {
        setErrorMessage(null)
        setSyncResult(null)
        let result: Awaited<ReturnType<typeof syncMutation.mutateAsync>>
        try {
            result = await syncMutation.mutateAsync()
        } catch (error) {
            setErrorMessage(error instanceof Error ? messageForError(error) : GENERIC_ERROR_MESSAGE)
            syncMutation.reset()
            return
        }

        syncMutation.reset()
        setSyncResult(result)
        await refreshStatus(true)
    }

    const disconnect = async () => {
        setErrorMessage(null)
        try {
            await disconnectMutation.mutateAsync()
        } catch (error) {
            setErrorMessage(error instanceof Error ? messageForError(error) : GENERIC_ERROR_MESSAGE)
            disconnectMutation.reset()
            return
        }

        disconnectMutation.reset()
        setConfirmDisconnect(false)
        setShowKeyForm(false)
        setSyncResult(null)
        form.reset({ apiKey: '' })
        await refreshStatus()
    }

    return {
        query,
        form,
        errorMessage,
        syncResult,
        showKeyForm,
        confirmDisconnect,
        isConnecting: form.formState.isSubmitting || connectMutation.isPending,
        isSyncing: syncMutation.isPending,
        isDisconnecting: disconnectMutation.isPending,
        submitApiKey,
        syncWorkouts,
        disconnect,
        setShowKeyForm,
        setConfirmDisconnect,
        clearError: () => setErrorMessage(null),
        formatTimestamp,
    }
}
