'use client'

import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useLyftaConnection } from '@/modules/settings/use-lyfta-connection'

export function LyftaTab() {
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
    const busy = lyfta.isConnecting || lyfta.isSyncing || lyfta.isDisconnecting

    return (
        <section aria-labelledby="lyfta-heading" className="grid max-w-xl gap-5">
            <div className="grid gap-2">
                <h2 id="lyfta-heading" className="text-lg font-semibold">
                    Lyfta
                </h2>
                <p className="max-w-prose text-sm text-muted-foreground">
                    Import completed gym workouts and sets from your Lyfta account. Sync starts only
                    when you choose it.
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
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            data-testid="lyfta-sync"
                            disabled={busy}
                            onClick={() => void lyfta.syncWorkouts()}
                        >
                            {lyfta.isSyncing ? <Loader2Icon className="animate-spin" /> : null}
                            Sync workouts
                        </Button>
                        {!lyfta.showKeyForm && !lyfta.confirmDisconnect ? (
                            <>
                                <Button
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
                                <Button
                                    variant="outline"
                                    data-testid="lyfta-disconnect"
                                    disabled={busy}
                                    onClick={() => {
                                        lyfta.clearError()
                                        lyfta.setConfirmDisconnect(true)
                                    }}
                                >
                                    Disconnect
                                </Button>
                            </>
                        ) : null}
                    </div>

                    {lyfta.confirmDisconnect ? (
                        <div className="grid gap-3 rounded-md border border-border p-4">
                            <p className="text-sm">
                                Disconnect Lyfta? Imported workouts and sets will stay in your
                                training history.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    variant="outline"
                                    data-testid="lyfta-disconnect-cancel"
                                    disabled={lyfta.isDisconnecting}
                                    onClick={() => lyfta.setConfirmDisconnect(false)}
                                >
                                    Keep connected
                                </Button>
                                <Button
                                    variant="destructive"
                                    data-testid="lyfta-disconnect-confirm"
                                    disabled={busy}
                                    onClick={() => void lyfta.disconnect()}
                                >
                                    {lyfta.isDisconnecting ? (
                                        <Loader2Icon className="animate-spin" />
                                    ) : null}
                                    Disconnect Lyfta
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {(!connected || lyfta.showKeyForm) && !lyfta.confirmDisconnect ? (
                <Form {...lyfta.form}>
                    <form
                        data-testid="lyfta-key-form"
                        onSubmit={lyfta.submitApiKey}
                        className="grid gap-4"
                        noValidate
                    >
                        {!connected ? (
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
                                . Your key is encrypted before it is saved and is never shown again.
                            </p>
                        ) : null}
                        <FormField
                            control={lyfta.form.control}
                            name="apiKey"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Lyfta personal API key</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            type="password"
                                            autoComplete="new-password"
                                            data-testid="lyfta-api-key"
                                            disabled={busy}
                                        />
                                    </FormControl>
                                    <FormMessage data-testid="lyfta-api-key-error" />
                                </FormItem>
                            )}
                        />
                        <div className="flex flex-wrap gap-3">
                            <Button type="submit" data-testid="lyfta-connect" disabled={busy}>
                                {lyfta.isConnecting ? (
                                    <Loader2Icon className="animate-spin" />
                                ) : null}
                                {connected ? 'Save new API key' : 'Connect Lyfta'}
                            </Button>
                            {connected ? (
                                <Button
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

            {lyfta.syncResult ? (
                <p data-testid="lyfta-sync-success" className="text-sm text-muted-foreground">
                    Sync complete: {lyfta.syncResult.created} workouts added and{' '}
                    {lyfta.syncResult.updated} updated. Last synced{' '}
                    {lyfta.formatTimestamp(lyfta.syncResult.lastSyncedAt)}.
                </p>
            ) : null}

            {lyfta.errorMessage ? (
                <p data-testid="lyfta-error" role="alert" className="text-sm text-destructive">
                    {lyfta.errorMessage}
                </p>
            ) : null}
        </section>
    )
}
