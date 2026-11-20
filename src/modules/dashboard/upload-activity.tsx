'use client'

import { toast } from 'sonner'
import { trpcClient } from '@/lib/trpc'
import { UploadActivityDrawer } from '@/modules/dashboard/upload-activity-drawer'

// Wires the real side effects: toast and the client calendar and week-strip queries.
export function UploadActivity() {
    const utils = trpcClient.useUtils()
    return (
        <UploadActivityDrawer
            onUploaded={() => {
                toast.success('Activity uploaded')
                void utils.training.getCalendar.invalidate()
            }}
        />
    )
}
