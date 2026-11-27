'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import { messageForZeppError } from '@/modules/zepp/zepp-ui.utils'

export function useClearZeppActivities() {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const mutation = useMutation(trpc.zepp.clearActivities.mutationOptions())
    const [open, setOpen] = useState(false)
    const [clearing, setClearing] = useState(false)

    const clear = async () => {
        if (clearing) return
        setClearing(true)
        try {
            const { deleted } = await mutation.mutateAsync()
            setOpen(false)
            toast.success(`Cleared ${deleted} Zepp ${deleted === 1 ? 'run' : 'runs'}.`)
            await Promise.all([
                queryClient.invalidateQueries(trpc.zepp.getActivityCount.queryFilter()),
                queryClient.invalidateQueries(trpc.zepp.getConnectionStatus.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getRunProgress.queryFilter()),
            ])
        } catch (cause) {
            toast.error(
                messageForZeppError({ message: cause instanceof Error ? cause.message : '' })
            )
        } finally {
            mutation.reset()
            setClearing(false)
        }
    }

    return { open, setOpen, clearing, clear }
}
