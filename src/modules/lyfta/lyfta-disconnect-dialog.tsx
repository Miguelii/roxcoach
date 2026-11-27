'use client'

import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
    disconnecting: boolean
}

// Asks before disconnecting Lyfta: a popup on desktop and a sheet from the bottom on a phone.
export function LyftaDisconnectDialog({ open, onOpenChange, onConfirm, disconnecting }: Props) {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Disconnect Lyfta?"
            description="Imported workouts and sets will stay in your training history. You can connect again with your API key."
            testId="lyfta-disconnect-dialog"
            cancelLabel="Keep connected"
            cancelTestId="lyfta-disconnect-cancel"
            busy={disconnecting}
            primaryAction={
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
            }
        />
    )
}
