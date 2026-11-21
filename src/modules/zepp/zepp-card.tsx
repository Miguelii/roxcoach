'use client'

import { Loader2Icon } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useZeppConnection } from '@/modules/zepp/use-zepp-connection'

const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

const formatTimestamp = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-US', TIMESTAMP_FORMAT)
}

export function ZeppCard() {
    const zepp = useZeppConnection()

    if (zepp.query.isPending) {
        return <Skeleton data-testid="zepp-loading" className="h-56 max-w-xl" />
    }

    if (zepp.query.isError) {
        return (
            <div data-testid="zepp-status-error" className="space-y-3">
                <p className="text-sm text-destructive">Could not load your Zepp connection.</p>
                <Button
                    variant="outline"
                    data-testid="zepp-status-retry"
                    onClick={() => void zepp.query.refetch()}
                >
                    Try again
                </Button>
            </div>
        )
    }

    const connected = zepp.query.data.connected
    const lastSyncedAt = zepp.query.data.lastSyncedAt
    const busy = zepp.isConnecting || zepp.isSyncing || zepp.isDisconnecting

    return (
        <section
            data-testid="zepp-card"
            aria-labelledby="zepp-heading"
            className="grid max-w-xl gap-5"
        >
            <div className="grid gap-2">
                <h2 id="zepp-heading" className="text-lg font-semibold">
                    Zepp
                </h2>
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
                                ? `Last synced ${formatTimestamp(lastSyncedAt)}`
                                : 'Runs have not been synced yet.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            className="w-full md:max-w-37.5"
                            data-testid="zepp-sync"
                            disabled={busy}
                            onClick={() => void zepp.sync()}
                        >
                            {zepp.isSyncing ? <Loader2Icon className="animate-spin" /> : null}
                            Sync runs
                        </Button>
                        {zepp.showForm ? null : (
                            <>
                                <Button
                                    className="w-full md:max-w-37.5"
                                    variant="outline"
                                    data-testid="zepp-reconnect"
                                    disabled={busy}
                                    onClick={zepp.openForm}
                                >
                                    Sign in again
                                </Button>
                                <Button
                                    className="w-full md:max-w-37.5"
                                    variant="destructive"
                                    data-testid="zepp-disconnect"
                                    disabled={busy}
                                    onClick={() => zepp.setConfirmDisconnect(true)}
                                >
                                    Disconnect
                                </Button>
                            </>
                        )}
                    </div>
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
                                        <Input
                                            {...field}
                                            type="password"
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

            {zepp.errorMessage && !zepp.confirmDisconnect ? (
                <p data-testid="zepp-error" role="alert" className="text-sm text-destructive">
                    {zepp.errorMessage}
                </p>
            ) : null}

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
            >
                {zepp.errorMessage === null ? null : (
                    <p
                        role="alert"
                        data-testid="zepp-disconnect-error"
                        className="text-sm text-destructive"
                    >
                        {zepp.errorMessage}
                    </p>
                )}
            </ConfirmDialog>
        </section>
    )
}
