'use client'

import { UploadActivity } from '@/modules/activity/upload-activity'
import { SyncLyfta } from '@/modules/lyfta/sync-lyfta'

export function ActivityActions() {
    return (
        <div
            data-testid="activity-actions"
            role="group"
            aria-label="Activity actions"
            className="grid justify-items-start gap-2 w-full"
        >
            <div className="flex flex-wrap md:flex-row items-center gap-3 w-full">
                <UploadActivity />
                <SyncLyfta />
            </div>
        </div>
    )
}
