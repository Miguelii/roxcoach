'use client'

import { useState } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { StravaResult } from '@/modules/settings/strava-result'

type StravaStatus = {
    connected: boolean
    connectedAt: string | null
    lastSyncedAt: string | null
    activityCount: number
}

type Action = 'connect' | 'sync' | 'disconnect'

type Props = {
    status: StravaStatus | null
    loadFailed?: boolean
    result?: StravaResult
    onConnect: () => Promise<void>
    onSync: () => Promise<void>
    onDisconnect: () => Promise<void>
    onError: (message: string) => void
    onRetry: () => void
}

const RESULT_COPY: Record<StravaResult, { text: string; tone: 'ok' | 'problem' }> = {
    connected: { text: 'Strava connected', tone: 'ok' },
    denied: { text: 'You did not allow access', tone: 'problem' },
    scope: { text: 'Roxcoach needs permission to read all your activities', tone: 'problem' },
    error: { text: 'Something went wrong, try again', tone: 'problem' },
}

const ERROR_COPY: Record<Action, string> = {
    connect: 'Could not start the Strava connection, try again',
    sync: 'Could not sync with Strava, try again',
    disconnect: 'Could not disconnect Strava, try again',
}

/** "Not synced yet" for a connection that never synced, otherwise a short local date and time. */
function formatLastSync(iso: string | null): string {
    if (!iso) return 'Not synced yet'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return 'Not synced yet'
    return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Presentational Strava card: data and actions come in through props. */
export function StravaCardView({
    status,
    loadFailed,
    result,
    onConnect,
    onSync,
    onDisconnect,
    onError,
    onRetry,
}: Props) {
    const [busy, setBusy] = useState<Action | null>(null)
    const [confirming, setConfirming] = useState(false)

    const run = async (action: Action, task: () => Promise<void>) => {
        setBusy(action)
        try {
            await task()
        } catch {
            // The cause stays out of the UI: it can carry server details.
            onError(ERROR_COPY[action])
        } finally {
            setBusy(null)
            setConfirming(false)
        }
    }

    const feedback = result ? RESULT_COPY[result] : undefined

    return (
        <Card data-testid="strava-card">
            <CardHeader>
                <CardTitle>Strava</CardTitle>
                <CardDescription>
                    Roxcoach reads your activities from Strava to build your calendar and reports.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {feedback ? (
                    <p
                        data-testid="strava-result"
                        role="status"
                        className={cn(
                            'rounded-md border px-3 py-2 text-sm',
                            feedback.tone === 'ok'
                                ? 'border-hairline text-foreground'
                                : 'border-destructive/40 text-destructive'
                        )}
                    >
                        {feedback.text}
                    </p>
                ) : null}

                {loadFailed ? (
                    <div className="space-y-2">
                        <p data-testid="strava-load-error" className="text-sm text-destructive">
                            Could not load your Strava status.
                        </p>
                        <Button data-testid="strava-retry" variant="outline" onClick={onRetry}>
                            Try again
                        </Button>
                    </div>
                ) : status === null ? (
                    <Skeleton data-testid="strava-loading" className="h-10 w-48" />
                ) : status.connected ? (
                    <div className="space-y-4">
                        <p data-testid="strava-status" className="text-sm font-medium">
                            Connected
                        </p>
                        <dl className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <dt className="eyebrow text-muted-foreground">Last sync</dt>
                                <dd data-testid="strava-last-sync">
                                    {formatLastSync(status.lastSyncedAt)}
                                </dd>
                            </div>
                            <div>
                                <dt className="eyebrow text-muted-foreground">Activities</dt>
                                <dd data-testid="strava-activity-count">{status.activityCount}</dd>
                            </div>
                        </dl>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                data-testid="strava-sync-now"
                                disabled={busy !== null}
                                onClick={() => run('sync', onSync)}
                            >
                                {busy === 'sync' ? (
                                    <IconLoader2 className="animate-spin" aria-hidden />
                                ) : null}
                                Sync now
                            </Button>
                            {confirming ? (
                                <>
                                    <Button
                                        data-testid="strava-disconnect-confirm"
                                        variant="destructive"
                                        disabled={busy !== null}
                                        onClick={() => run('disconnect', onDisconnect)}
                                    >
                                        Yes, disconnect
                                    </Button>
                                    <Button
                                        data-testid="strava-disconnect-cancel"
                                        variant="ghost"
                                        disabled={busy !== null}
                                        onClick={() => setConfirming(false)}
                                    >
                                        Cancel
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    data-testid="strava-disconnect"
                                    variant="outline"
                                    disabled={busy !== null}
                                    onClick={() => setConfirming(true)}
                                >
                                    Disconnect
                                </Button>
                            )}
                        </div>
                        {confirming ? (
                            <p className="text-sm text-muted-foreground">
                                Your imported activities stay in Roxcoach.
                            </p>
                        ) : null}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p data-testid="strava-status" className="text-sm font-medium">
                            Not connected
                        </p>
                        <Button
                            data-testid="strava-connect"
                            disabled={busy !== null}
                            onClick={() => run('connect', onConnect)}
                        >
                            {busy === 'connect' ? (
                                <IconLoader2 className="animate-spin" aria-hidden />
                            ) : null}
                            Connect Strava
                        </Button>
                    </div>
                )}

                <p data-testid="strava-attribution" className="text-xs text-muted-foreground">
                    Compatible with Strava
                </p>
            </CardContent>
        </Card>
    )
}
