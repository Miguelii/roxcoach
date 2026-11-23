'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import { messageForLyftaError } from '@/modules/lyfta/lyfta-ui.utils'

export function useClearLyftaActivities() {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const mutation = useMutation(trpc.lyfta.clearActivities.mutationOptions())
    const [open, setOpenState] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const setOpen = (next: boolean) => {
        if (!next) setError(null)
        setOpenState(next)
    }

    const clear = async () => {
        if (clearing) return
        setClearing(true)
        setError(null)
        try {
            const { deleted } = await mutation.mutateAsync()
            setOpenState(false)
            toast.success(`Cleared ${deleted} Lyfta ${deleted === 1 ? 'workout' : 'workouts'}.`)
            await Promise.all([
                queryClient.invalidateQueries(trpc.lyfta.getActivityCount.queryFilter()),
                queryClient.invalidateQueries(trpc.lyfta.getConnectionStatus.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter()),
                queryClient.invalidateQueries(trpc.training.getStrengthProgress.queryFilter()),
            ])
        } catch (cause) {
            setError(messageForLyftaError({ message: cause instanceof Error ? cause.message : '' }))
        } finally {
            mutation.reset()
            setClearing(false)
        }
    }

    return { open, setOpen, clearing, error, clear }
}
