'use client'

import Link from 'next/link'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QueryError } from '@/components/query-error'
import { trpcClient } from '@/lib/trpc'
import { useLyftaSync } from '@/modules/lyfta/use-lyfta-sync'
import { UploadActivity } from '@/modules/dashboard/upload-activity'

export function ActivityActions() {
    const connection = trpcClient.lyfta.getConnectionStatus.useQuery()
    const lyfta = useLyftaSync()

    return (
        <div
            data-testid="activity-actions"
            role="group"
            aria-label="Activity actions"
            className="grid justify-items-start gap-2"
        >
            <div className="flex flex-wrap items-center gap-3">
                <UploadActivity />
                <Button
                    type="button"
                    variant="outline"
                    data-testid="activity-sync-lyfta"
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
            </div>

            {connection.isError ? (
                <QueryError
                    message="Could not load your Lyfta connection."
                    onRetry={() => void connection.refetch()}
                    testId="activity-sync-status-error"
                />
            ) : null}

            {!connection.isPending &&
            !connection.isError &&
            connection.data?.connected === false ? (
                <p
                    data-testid="activity-sync-connect-prompt"
                    className="text-sm text-muted-foreground"
                >
                    Lyfta is not connected.{' '}
                    <Link
                        href="/settings"
                        data-testid="activity-sync-connect-link"
                        className="underline underline-offset-4"
                    >
                        Connect it in Settings
                    </Link>{' '}
                    before syncing.
                </p>
            ) : null}

            {lyfta.syncResult ? (
                <p data-testid="activity-sync-success" className="text-sm text-muted-foreground">
                    Sync complete: {lyfta.syncResult.created} workouts added and{' '}
                    {lyfta.syncResult.updated} updated. Last synced{' '}
                    {lyfta.formatTimestamp(lyfta.syncResult.lastSyncedAt)}.
                </p>
            ) : null}

            {lyfta.errorMessage ? (
                <p
                    data-testid="activity-sync-error"
                    role="alert"
                    className="text-sm text-destructive"
                >
                    {lyfta.errorMessage}
                </p>
            ) : null}
        </div>
    )
}
