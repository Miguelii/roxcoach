'use client'

import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import { UploadActivityDrawer } from '@/modules/dashboard/upload-activity-drawer'

// Wires the real side effects: toast and the client calendar and week-strip queries.
export function UploadActivity() {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    return (
        <UploadActivityDrawer
            onUploaded={() => {
                toast.success('Activity uploaded')
                void queryClient.invalidateQueries(trpc.training.getCalendar.queryFilter())
                void queryClient.invalidateQueries(trpc.training.getRunProgress.queryFilter())
                void queryClient.invalidateQueries(trpc.training.getStrengthProgress.queryFilter())
            }}
        />
    )
}
