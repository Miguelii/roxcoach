'use client'

import { SyncIntegrations } from '@/components/sync-integrations'
import { cn } from '@/lib/utils'
import { UploadActivity } from '@/modules/activity/upload-activity'
import { useSyncLyfta } from '@/modules/lyfta/use-sync-lyfta'
import { useSyncZepp } from '@/modules/zepp/use-sync-zepp'

type Props = {
    // From `sm` up, size to the buttons and keep them on one row, so the group can sit at the end
    // of a toolbar. On a phone it is full width either way.
    inline?: boolean
}

export function ActivityActions({ inline = false }: Props) {
    const sources = [useSyncLyfta(), useSyncZepp()]

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
                    // The buttons are w-full by default; inline they take their own width.
                    inline &&
                        'sm:w-auto sm:flex-nowrap sm:[&_button]:w-auto sm:[&_button]:max-w-none sm:[&_button]:shrink-0'
                )}
            >
                <UploadActivity />
                <SyncIntegrations sources={sources} />
            </div>
        </div>
    )
}
