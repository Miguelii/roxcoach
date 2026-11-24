'use client'

import { Loader2Icon } from 'lucide-react'
import { ClearActivitiesDialog } from '@/components/clear-activities-dialog'
import { IntegrationDangerZone } from '@/components/integration-danger-zone'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { PasswordInput } from '@/components/ui/password-input'
import { Skeleton } from '@/components/ui/skeleton'
import { LyftaDisconnectDialog } from '@/modules/lyfta/lyfta-disconnect-dialog'
import { LYFTA_MORE_TO_SYNC_MESSAGE } from '@/modules/lyfta/lyfta-ui.utils'
import { useLyftaConnection } from '@/modules/lyfta/use-lyfta-connection'

export function LyftaCard() {
    const lyfta = useLyftaConnection()

    if (lyfta.query.isPending) {
        return <Skeleton data-testid="lyfta-loading" className="h-56 max-w-xl" />
    }

    if (lyfta.query.isError) {
        return (
            <div data-testid="lyfta-status-error" className="space-y-3">
                <p className="text-sm text-destructive">Could not load your Lyfta connection.</p>
                <Button
                    variant="outline"
                    data-testid="lyfta-status-retry"
                    onClick={() => void lyfta.query.refetch()}
                >
                    Try again
                </Button>
            </div>
        )
    }

    const connected = lyfta.query.data.connected
    const busy =
        lyfta.isConnecting ||
        lyfta.isSyncing ||
        lyfta.isDisconnecting ||
        lyfta.clearActivities.clearing

    return (
        <section aria-labelledby="lyfta-heading" className="grid max-w-xl gap-5">
            <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 id="lyfta-heading" className="text-lg font-semibold">
                        Lyfta
                    </h2>
                    <IntegrationStatusPill connected={connected} testId="lyfta-status-pill" />
                </div>
                <p className="max-w-prose text-sm text-muted-foreground">
                    Import completed gym workouts and sets from your Lyfta account. The first sync
                    imports the last 360 days. Sync starts only when you choose it.
                </p>
            </div>

            {connected ? (
                <div data-testid="lyfta-connected" className="grid gap-4">
                    <div className="grid gap-1">
                        <p className="text-sm font-medium">Lyfta is connected</p>
                        <p
                            data-testid="lyfta-last-synced"
                            className="text-sm text-muted-foreground"
                        >
                            {lyfta.query.data.lastSyncedAt
                                ? `Last synced ${lyfta.formatTimestamp(lyfta.query.data.lastSyncedAt)}`
                                : 'Workouts have not been synced yet.'}
                        </p>
                        {lyfta.activityCount === undefined ? null : (
                            <p
                                data-testid="lyfta-imported-count"
                                className="text-sm text-muted-foreground"
                            >
                                {lyfta.activityCount}{' '}
                                {lyfta.activityCount === 1 ? 'workout' : 'workouts'} imported
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            className="w-full md:max-w-37.5"
                            data-testid="lyfta-sync"
                            disabled={busy}
                            onClick={() => void lyfta.syncWorkouts()}
                        >
                            {lyfta.isSyncing ? (
                                <Loader2Icon
                                    data-testid="lyfta-sync-spinner"
                                    className="animate-spin"
                                />
                            ) : null}
                            Sync workouts
                        </Button>
                        {lyfta.showKeyForm ? null : (
                            <Button
                                className="w-full md:max-w-37.5"
                                variant="outline"
                                data-testid="lyfta-replace-key"
                                disabled={busy}
                                onClick={() => {
                                    lyfta.clearError()
                                    lyfta.setShowKeyForm(true)
                                }}
                            >
                                Replace API key
                            </Button>
                        )}
                    </div>

                    {lyfta.showKeyForm ? null : (
                        <IntegrationDangerZone
                            provider="Lyfta"
                            items="workouts"
                            count={lyfta.activityCount}
                            disabled={busy}
                            onClear={() => {
                                lyfta.clearError()
                                lyfta.clearActivities.setOpen(true)
                            }}
                            onDisconnect={() => {
                                lyfta.clearError()
                                lyfta.setConfirmDisconnect(true)
                            }}
                            testIdPrefix="lyfta"
                        />
                    )}
                </div>
            ) : null}

            {!connected || lyfta.showKeyForm ? (
                <Form {...lyfta.form}>
                    <form
                        data-testid="lyfta-key-form"
                        onSubmit={lyfta.submitApiKey}
                        className="grid gap-4"
                        noValidate
                    >
                        {connected ? null : (
                            <p className="max-w-prose text-sm text-muted-foreground">
                                Create a personal API key in{' '}
                                <a
                                    href="https://my.lyfta.app/community/api"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline underline-offset-4"
                                >
                                    Lyfta account settings
                                </a>
                                .
                            </p>
                        )}
                        <FormField
                            control={lyfta.form.control}
                            name="apiKey"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Lyfta personal API key</FormLabel>
                                    <FormControl>
                                        <PasswordInput
                                            {...field}
                                            secretName="API key"
                                            autoComplete="new-password"
                                            data-testid="lyfta-api-key"
                                            disabled={busy}
                                        />
                                    </FormControl>
                                    <FormMessage data-testid="lyfta-api-key-error" />
                                </FormItem>
                            )}
                        />
                        <div className="flex flex-col md:flex-row w-full md:flex-wrap gap-3">
                            <Button
                                className="w-full md:w-fit"
                                type="submit"
                                data-testid="lyfta-connect"
                                disabled={busy}
                            >
                                {lyfta.isConnecting ? (
                                    <Loader2Icon className="animate-spin" />
                                ) : null}
                                {connected ? 'Save new API key' : 'Connect Lyfta'}
                            </Button>
                            {connected ? (
                                <Button
                                    className="w-full md:max-w-17.5"
                                    type="button"
                                    variant="outline"
                                    data-testid="lyfta-replace-cancel"
                                    disabled={busy}
                                    onClick={() => {
                                        lyfta.form.reset({ apiKey: '' })
                                        lyfta.setShowKeyForm(false)
                                        lyfta.clearError()
                                    }}
                                >
                                    Cancel
                                </Button>
                            ) : null}
                        </div>
                    </form>
                </Form>
            ) : null}

            {lyfta.syncResult?.hasMore ? (
                <p data-testid="lyfta-sync-more" className="text-sm text-muted-foreground">
                    {lyfta.syncResult.created} workouts added and {lyfta.syncResult.updated}{' '}
                    updated. {LYFTA_MORE_TO_SYNC_MESSAGE}
                </p>
            ) : null}

            {lyfta.syncResult && !lyfta.syncResult.hasMore ? (
                <p data-testid="lyfta-sync-success" className="text-sm text-muted-foreground">
                    Sync complete: {lyfta.syncResult.created} workouts added and{' '}
                    {lyfta.syncResult.updated} updated.
                </p>
            ) : null}

            {/* While the confirmation is open it shows the error itself. */}
            {lyfta.errorMessage && !lyfta.confirmDisconnect ? (
                <p data-testid="lyfta-error" role="alert" className="text-sm text-destructive">
                    {lyfta.errorMessage}
                </p>
            ) : null}

            <ClearActivitiesDialog
                open={lyfta.clearActivities.open}
                onOpenChange={lyfta.clearActivities.setOpen}
                onConfirm={() => void lyfta.clearActivities.clear()}
                clearing={lyfta.clearActivities.clearing}
                error={lyfta.clearActivities.error}
                provider="Lyfta"
                items="workouts"
                extra="sets"
                count={lyfta.activityCount ?? 0}
                testIdPrefix="lyfta"
            />

            <LyftaDisconnectDialog
                open={lyfta.confirmDisconnect}
                onOpenChange={lyfta.setConfirmDisconnect}
                onConfirm={() => void lyfta.disconnect()}
                disconnecting={lyfta.isDisconnecting}
                error={lyfta.errorMessage}
            />
        </section>
    )
}
