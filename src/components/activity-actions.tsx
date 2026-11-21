'use client'

import { cn } from '@/lib/utils'
import { UploadActivity } from '@/modules/activity/upload-activity'
import { SyncLyfta } from '@/modules/lyfta/sync-lyfta'

type Props = {
    // From `sm` up, size to the buttons and keep them on one row, so the group can sit at the end
    // of a toolbar. On a phone it is full width either way.
    inline?: boolean
}

export function ActivityActions({ inline = false }: Props) {
    return (
        <div
            data-testid="activity-actions"
            role="group"
            aria-label="Activity actions"
            className={cn('grid justify-items-start gap-2 w-full', inline && 'sm:w-auto')}
        >
            <div
                className={cn(
                    'flex flex-wrap md:flex-row items-center gap-3 w-full',
                    inline && 'sm:w-auto sm:flex-nowrap'
                )}
            >
                <UploadActivity />
                <SyncLyfta />
            </div>
        </div>
    )
}
