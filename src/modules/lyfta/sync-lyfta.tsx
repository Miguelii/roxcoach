'use client'

import { useRouter } from 'next/navigation'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { trpcClient } from '@/lib/trpc'
import { LYFTA_MORE_TO_SYNC_MESSAGE } from '@/modules/lyfta/lyfta-ui.utils'
import { useLyftaSync } from '@/modules/lyfta/use-lyfta-sync'

// Everything it has to say goes through toasts, like the activity upload: no text under the button.
export function SyncLyfta() {
    const router = useRouter()
    const connection = trpcClient.lyfta.getConnectionStatus.useQuery()
    const lyfta = useLyftaSync({
        onSynced: (result) => {
            const summary = `${result.created} workouts added and ${result.updated} updated.`
            if (result.hasMore) toast.info(`${summary} ${LYFTA_MORE_TO_SYNC_MESSAGE}`)
            else toast.success(`Lyfta synced: ${summary}`)
        },
        onFailed: (message) => toast.error(message),
    })

    const sync = () => {
        if (connection.isError) {
            toast.error('Could not load your Lyfta connection.')
            return
        }
        if (connection.data?.connected === false) {
            toast.info('Lyfta is not connected.', {
                action: { label: 'Open Settings', onClick: () => router.push('/settings') },
            })
            return
        }
        void lyfta.syncWorkouts()
    }

    return (
        <Button
            className="w-full md:max-w-37.5"
            type="button"
            variant="outline"
            data-testid="sync-lyfta"
            disabled={connection.isPending || lyfta.isSyncing}
            onClick={sync}
        >
            {lyfta.isSyncing ? <Loader2Icon className="animate-spin" /> : null}
            Sync Lyfta
        </Button>
    )
}
