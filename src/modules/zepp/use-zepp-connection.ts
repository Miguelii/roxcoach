'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import { messageForZeppError, zeppSyncMessage } from '@/modules/zepp/zepp-ui.utils'

export type ZeppFormValues = z.infer<typeof zeppFormSchema>

const zeppFormSchema = z.object({
    email: z.string().trim().min(1, 'Enter your Zepp email').email('Enter a valid email'),
    password: z.string().min(1, 'Enter your Zepp password'),
})

export function useZeppConnection() {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const query = useQuery(trpc.zepp.getConnectionStatus.queryOptions())
    const connectMutation = useMutation(trpc.zepp.connect.mutationOptions({ gcTime: 0 }))
    const syncMutation = useMutation(trpc.zepp.syncActivities.mutationOptions())
    const disconnectMutation = useMutation(trpc.zepp.disconnect.mutationOptions())
    const form = useForm<ZeppFormValues>({
        resolver: zodResolver(zeppFormSchema),
        defaultValues: { email: '', password: '' },
    })
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [syncMessage, setSyncMessage] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)

    const refreshStatus = () =>
        queryClient.invalidateQueries(trpc.zepp.getConnectionStatus.queryFilter())

    const submit = form.handleSubmit(async (values) => {
        setErrorMessage(null)
        setSyncMessage(null)
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
        setSyncMessage(null)
        try {
            const result = await syncMutation.mutateAsync()
            setSyncMessage(zeppSyncMessage(result))
        } catch (error) {
            setErrorMessage(
                messageForZeppError({ message: error instanceof Error ? error.message : '' })
            )
            syncMutation.reset()
            return
        }

        syncMutation.reset()
        await Promise.all([
            refreshStatus(),
            queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter()),
            queryClient.invalidateQueries(trpc.training.getRunProgress.queryFilter()),
        ])
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
        setSyncMessage(null)
        form.reset({ email: '', password: '' })
        await refreshStatus()
    }

    return {
        query,
        form,
        errorMessage,
        syncMessage,
        showForm,
        confirmDisconnect,
        isConnecting: form.formState.isSubmitting || connectMutation.isPending,
        isSyncing: syncMutation.isPending,
        isDisconnecting: disconnectMutation.isPending,
        submit,
        sync,
        disconnect,
        setConfirmDisconnect,
        openForm: () => {
            setErrorMessage(null)
            setShowForm(true)
        },
        closeForm: () => {
            form.reset({ email: '', password: '' })
            setShowForm(false)
        },
    }
}
