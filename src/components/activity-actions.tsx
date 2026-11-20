'use client'

import { UploadActivity } from '@/modules/activity/upload-activity'
import { SyncLyfta } from '@/modules/lyfta/sync-lyfta'

export function ActivityActions() {
    return (
        <div
            data-testid="activity-actions"
            role="group"
            aria-label="Activity actions"
            className="grid justify-items-start gap-2"
        >
            <div className="flex flex-wrap items-center gap-3">
                <UploadActivity />
                <SyncLyfta />
            </div>
        </div>
    )
}
