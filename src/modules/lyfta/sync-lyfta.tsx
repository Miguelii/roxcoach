'use client'

import Link from 'next/link'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QueryError } from '@/components/query-error'
import { trpcClient } from '@/lib/trpc'
import { LYFTA_MORE_TO_SYNC_MESSAGE } from '@/modules/lyfta/lyfta-ui.utils'
import { useLyftaSync } from '@/modules/lyfta/use-lyfta-sync'

export function SyncLyfta() {
    const connection = trpcClient.lyfta.getConnectionStatus.useQuery()
    const lyfta = useLyftaSync()

    return (
        <>
            <Button
                type="button"
                variant="outline"
                data-testid="sync-lyfta"
                disabled={
                    connection.isPending ||
                    connection.isError ||
                    !connection.data?.connected ||
                    lyfta.isSyncing
                }
                onClick={() => void lyfta.syncWorkouts()}
            >
                {lyfta.isSyncing ? <Loader2Icon className="animate-spin" /> : null}
                Sync Lyfta
            </Button>

            {connection.isError ? (
                <QueryError
                    message="Could not load your Lyfta connection."
                    onRetry={() => void connection.refetch()}
                    testId="sync-lyfta-status-error"
                />
            ) : null}

            {!connection.isPending &&
            !connection.isError &&
            connection.data?.connected === false ? (
                <p
                    data-testid="sync-lyfta-connect-prompt"
                    className="text-sm text-muted-foreground"
                >
                    Lyfta is not connected.{' '}
                    <Link
                        href="/settings"
                        data-testid="sync-lyfta-connect-link"
                        className="underline underline-offset-4"
                    >
                        Connect it in Settings
                    </Link>{' '}
                    before syncing.
                </p>
            ) : null}

            {lyfta.syncResult?.hasMore ? (
                <p data-testid="sync-lyfta-more" className="text-sm text-muted-foreground">
                    {lyfta.syncResult.created} workouts added and {lyfta.syncResult.updated}{' '}
                    updated. {LYFTA_MORE_TO_SYNC_MESSAGE}
                </p>
            ) : null}

            {lyfta.syncResult && !lyfta.syncResult.hasMore ? (
                <p data-testid="sync-lyfta-success" className="text-sm text-muted-foreground">
                    Sync complete: {lyfta.syncResult.created} workouts added and{' '}
                    {lyfta.syncResult.updated} updated.
                    {lyfta.syncResult.lastSyncedAt
                        ? ` Last synced ${lyfta.formatTimestamp(lyfta.syncResult.lastSyncedAt)}.`
                        : ''}
                </p>
            ) : null}

            {lyfta.errorMessage ? (
                <p data-testid="sync-lyfta-error" role="alert" className="text-sm text-destructive">
                    {lyfta.errorMessage}
                </p>
            ) : null}
        </>
    )
}
