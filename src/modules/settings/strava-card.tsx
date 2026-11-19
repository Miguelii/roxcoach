'use client'

import { toast } from 'sonner'
import { trpcClient } from '@/lib/trpc'
import { StravaCardView } from '@/modules/settings/strava-card-view'
import { isStravaUrl, type StravaResult } from '@/modules/settings/strava-result'

type Props = {
    result?: StravaResult
}

/** Thin wrapper: binds the Strava tRPC procedures to the presentational card. */
export function StravaCard({ result }: Props) {
    const utils = trpcClient.useUtils()
    const status = trpcClient.strava.getStatus.useQuery()
    const getConnectUrl = trpcClient.strava.getConnectUrl.useMutation()
    const syncNow = trpcClient.strava.syncNow.useMutation()
    const disconnect = trpcClient.strava.disconnect.useMutation()

    const refresh = () => utils.strava.getStatus.invalidate()

    return (
        <StravaCardView
            status={status.data ?? null}
            loadFailed={status.isError}
            result={result}
            onConnect={async () => {
                const { url } = await getConnectUrl.mutateAsync()
                if (!isStravaUrl(url)) throw new Error('Unexpected connect url')
                window.location.assign(url)
            }}
            onSync={async () => {
                await syncNow.mutateAsync()
                await refresh()
            }}
            onDisconnect={async () => {
                await disconnect.mutateAsync()
                await refresh()
            }}
            onError={(message) => toast.error(message)}
            onRetry={() => void status.refetch()}
        />
    )
}
