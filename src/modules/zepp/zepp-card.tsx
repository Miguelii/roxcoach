'use client'

import { Loader2Icon } from 'lucide-react'
import { ClearActivitiesDialog } from '@/components/clear-activities-dialog'
import { IntegrationDangerZone } from '@/components/integration-danger-zone'
import { IntegrationStatusPill } from '@/components/integration-status-pill'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/formatters'
import { useZeppConnection } from '@/modules/zepp/use-zepp-connection'

export function ZeppCard() {
    const zepp = useZeppConnection()

    if (zepp.query.isPending) {
        return <Skeleton data-testid="zepp-loading" className="h-56 max-w-xl" />
    }

    if (zepp.query.data === undefined) return null

    const connected = zepp.query.data.connected
    const lastSyncedAt = zepp.query.data.lastSyncedAt
    const busy =
        zepp.isConnecting || zepp.isSyncing || zepp.isDisconnecting || zepp.clearActivities.clearing

    return (
        <section
            data-testid="zepp-card"
            aria-labelledby="zepp-heading"
            className="grid max-w-xl gap-5"
        >
            <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 id="zepp-heading" className="text-lg font-semibold">
                        Zepp
                    </h2>
                    <IntegrationStatusPill connected={connected} testId="zepp-status-pill" />
                </div>
                <p className="max-w-prose text-sm text-muted-foreground">
                    Import your outdoor runs from your Zepp account (Amazfit). Your password is used
                    once to sign in and is never stored. Sync starts only when you choose it.
                </p>
            </div>

            {connected ? (
                <div data-testid="zepp-connected" className="grid gap-4">
                    <div className="grid gap-1">
                        <p className="text-sm font-medium">Zepp is connected</p>
                        <p data-testid="zepp-last-synced" className="text-sm text-muted-foreground">
                            {lastSyncedAt
                                ? `Last synced ${formatDateTime(lastSyncedAt)}`
                                : 'Runs have not been synced yet.'}
                        </p>
                        {zepp.activityCount === undefined ? null : (
                            <p
                                data-testid="zepp-imported-count"
                                className="text-sm text-muted-foreground"
                            >
                                {zepp.activityCount} {zepp.activityCount === 1 ? 'run' : 'runs'}{' '}
                                imported
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            className="w-full md:max-w-37.5"
                            data-testid="zepp-sync"
                            disabled={busy}
                            onClick={() => void zepp.sync()}
                        >
                            {zepp.isSyncing ? (
                                <Loader2Icon
                                    data-testid="zepp-sync-spinner"
                                    className="animate-spin"
                                />
                            ) : null}
                            Sync runs
                        </Button>
                        {zepp.showForm ? null : (
                            <Button
                                className="w-full md:max-w-37.5"
                                variant="outline"
                                data-testid="zepp-reconnect"
                                disabled={busy}
                                onClick={zepp.openForm}
                            >
                                Sign in again
                            </Button>
                        )}
                    </div>

                    {zepp.showForm ? null : (
                        <IntegrationDangerZone
                            provider="Zepp"
                            items="runs"
                            count={zepp.activityCount}
                            disabled={busy}
                            onClear={() => {
                                zepp.clearError()
                                zepp.clearActivities.setOpen(true)
                            }}
                            onDisconnect={() => zepp.setConfirmDisconnect(true)}
                            testIdPrefix="zepp"
                        />
                    )}
                </div>
            ) : null}

            {!connected || zepp.showForm ? (
                <Form {...zepp.form}>
                    <form
                        data-testid="zepp-form"
                        onSubmit={zepp.submit}
                        className="grid gap-4"
                        noValidate
                    >
                        <FormField
                            control={zepp.form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Zepp email</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            type="email"
                                            autoComplete="username"
                                            data-testid="zepp-email"
                                            disabled={busy}
                                        />
                                    </FormControl>
                                    <FormMessage data-testid="zepp-email-error" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={zepp.form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Zepp password</FormLabel>
                                    <FormControl>
                                        <PasswordInput
                                            {...field}
                                            autoComplete="current-password"
                                            data-testid="zepp-password"
                                            disabled={busy}
                                        />
                                    </FormControl>
                                    <FormMessage data-testid="zepp-password-error" />
                                </FormItem>
                            )}
                        />
                        <div className="flex w-full flex-col gap-3 md:flex-row md:flex-wrap">
                            <Button
                                className="w-full md:w-fit"
                                type="submit"
                                data-testid="zepp-connect"
                                disabled={busy}
                            >
                                {zepp.isConnecting ? (
                                    <Loader2Icon className="animate-spin" />
                                ) : null}
                                {connected ? 'Sign in again' : 'Connect Zepp'}
                            </Button>
                            {connected ? (
                                <Button
                                    className="w-full md:w-fit"
                                    type="button"
                                    variant="outline"
                                    data-testid="zepp-reconnect-cancel"
                                    disabled={busy}
                                    onClick={zepp.closeForm}
                                >
                                    Cancel
                                </Button>
                            ) : null}
                        </div>
                    </form>
                </Form>
            ) : null}

            {zepp.syncMessage ? (
                <p data-testid="zepp-sync-result" className="text-sm text-muted-foreground">
                    {zepp.syncMessage}
                </p>
            ) : null}

            <ClearActivitiesDialog
                open={zepp.clearActivities.open}
                onOpenChange={zepp.clearActivities.setOpen}
                onConfirm={() => void zepp.clearActivities.clear()}
                clearing={zepp.clearActivities.clearing}
                provider="Zepp"
                items="runs"
                extra="laps"
                count={zepp.activityCount ?? 0}
                testIdPrefix="zepp"
            />

            <ConfirmDialog
                open={zepp.confirmDisconnect}
                onOpenChange={zepp.setConfirmDisconnect}
                title="Disconnect Zepp?"
                description="Imported runs will stay in your training history. You can connect again with your email and password."
                testId="zepp-disconnect-dialog"
                cancelLabel="Keep connected"
                cancelTestId="zepp-disconnect-cancel"
                busy={zepp.isDisconnecting}
                primaryAction={
                    <Button
                        type="button"
                        variant="destructive"
                        data-testid="zepp-disconnect-confirm"
                        disabled={zepp.isDisconnecting}
                        onClick={() => void zepp.disconnect()}
                    >
                        {zepp.isDisconnecting ? <Loader2Icon className="animate-spin" /> : null}
                        {zepp.isDisconnecting ? 'Disconnecting...' : 'Disconnect Zepp'}
                    </Button>
                }
            />
        </section>
    )
}
