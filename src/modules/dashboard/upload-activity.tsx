'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpcClient } from '@/lib/trpc'
import { UploadActivityDrawer } from '@/modules/dashboard/upload-activity-drawer'

// Wires the real side effects: toast, server components refresh and the client calendar query.
export function UploadActivity() {
    const router = useRouter()
    const utils = trpcClient.useUtils()
    return (
        <UploadActivityDrawer
            onUploaded={() => {
                toast.success('Activity uploaded')
                router.refresh()
                void utils.training.getCalendar.invalidate()
            }}
        />
    )
}
