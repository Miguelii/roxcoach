'use client'

import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
    disconnecting: boolean
    // Why the last attempt failed, shown here because the dialog covers the page.
    error: string | null
}

// Asks before disconnecting Lyfta, like deleting a race: a popup on desktop and a sheet from the
// bottom on a phone (the shared Dialog does both).
export function LyftaDisconnectDialog({
    open,
    onOpenChange,
    onConfirm,
    disconnecting,
    error,
}: Props) {
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!disconnecting || next) onOpenChange(next)
            }}
        >
            <DialogContent
                role="alertdialog"
                showCloseButton={!disconnecting}
                data-testid="lyfta-disconnect-dialog"
                className="md:max-w-md"
            >
                <DialogHeader>
                    <DialogTitle>Disconnect Lyfta?</DialogTitle>
                    <DialogDescription>
                        Imported workouts and sets will stay in your training history. You can
                        connect again with your API key.
                    </DialogDescription>
                </DialogHeader>
                {error === null ? null : (
                    <p
                        role="alert"
                        data-testid="lyfta-disconnect-error"
                        className="text-sm text-destructive"
                    >
                        {error}
                    </p>
                )}
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="lyfta-disconnect-cancel"
                        disabled={disconnecting}
                        onClick={() => onOpenChange(false)}
                    >
                        Keep connected
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        data-testid="lyfta-disconnect-confirm"
                        disabled={disconnecting}
                        onClick={onConfirm}
                    >
                        {disconnecting ? <Loader2Icon className="animate-spin" /> : null}
                        {disconnecting ? 'Disconnecting...' : 'Disconnect Lyfta'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
