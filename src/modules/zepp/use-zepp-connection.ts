'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SYNC_START_MESSAGE } from '@/_bff/core/constants/sync.constants'
import { useTRPC } from '@/lib/trpc'
import { pollWhileSyncing } from '@/lib/sync-state'
import { useClearZeppActivities } from '@/modules/zepp/use-clear-zepp-activities'
import { useZeppSync } from '@/modules/zepp/use-zepp-sync'
import { messageForZeppError } from '@/modules/zepp/zepp-ui.utils'

export type ZeppFormValues = z.infer<typeof zeppFormSchema>

const zeppFormSchema = z.object({
    email: z.string().trim().min(1, 'Enter your Zepp email').email('Enter a valid email'),
    password: z.string().min(1, 'Enter your Zepp password'),
})

export function useZeppConnection() {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const query = useQuery(
        trpc.zepp.getConnectionStatus.queryOptions(undefined, {
            refetchInterval: (current) => pollWhileSyncing(current.state.data),
        })
    )
    const zeppSync = useZeppSync({
        sync: query.data?.sync,
        onStarted: () => toast.info(SYNC_START_MESSAGE),
        onInProgress: (message) => toast.info(message),
        onFailed: (message) => toast.error(message),
    })
    const countQuery = useQuery(trpc.zepp.getActivityCount.queryOptions())
    const clearActivities = useClearZeppActivities()
    const connectMutation = useMutation(trpc.zepp.connect.mutationOptions({ gcTime: 0 }))
    const disconnectMutation = useMutation(trpc.zepp.disconnect.mutationOptions())
    const form = useForm<ZeppFormValues>({
        resolver: zodResolver(zeppFormSchema),
        defaultValues: { email: '', password: '' },
    })
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)

    const refreshStatus = () =>
        queryClient.invalidateQueries(trpc.zepp.getConnectionStatus.queryFilter())

    const submit = form.handleSubmit(async (values) => {
        setErrorMessage(null)
        zeppSync.clearMessage()
        try {
            await connectMutation.mutateAsync(values)
        } catch (error) {
            setErrorMessage(
                messageForZeppError({ message: error instanceof Error ? error.message : '' })
            )
            form.resetField('password')
            connectMutation.reset()
            return
        }

        connectMutation.reset()
        form.reset({ email: '', password: '' })
        setShowForm(false)
        await refreshStatus()
    })

    const sync = async () => {
        setErrorMessage(null)
        await zeppSync.sync()
    }

    const disconnect = async () => {
        setErrorMessage(null)
        try {
            await disconnectMutation.mutateAsync()
        } catch (error) {
            setErrorMessage(
                messageForZeppError({ message: error instanceof Error ? error.message : '' })
            )
            disconnectMutation.reset()
            return
        }

        disconnectMutation.reset()
        setConfirmDisconnect(false)
        setShowForm(false)
        zeppSync.clearMessage()
        form.reset({ email: '', password: '' })
        await refreshStatus()
    }

    return {
        query,
        form,
        errorMessage: errorMessage ?? zeppSync.errorMessage,
        syncMessage: zeppSync.syncMessage,
        showForm,
        confirmDisconnect,
        isConnecting: form.formState.isSubmitting || connectMutation.isPending,
        isSyncing: zeppSync.isSyncing,
        isDisconnecting: disconnectMutation.isPending,
        activityCount: countQuery.data?.count,
        clearActivities,
        submit,
        sync,
        disconnect,
        setConfirmDisconnect,
        clearError: () => {
            setErrorMessage(null)
            zeppSync.clearError()
        },
        openForm: () => {
            setErrorMessage(null)
            zeppSync.clearError()
            setShowForm(true)
        },
        closeForm: () => {
            form.reset({ email: '', password: '' })
            setShowForm(false)
        },
    }
}
