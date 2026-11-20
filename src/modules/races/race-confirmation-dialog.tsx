'use client'

import { useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

type Action = 'cancel' | 'delete'

type Props = {
    race: RaceDTO
    action: Action | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => Promise<void> | void
}

export function RaceConfirmationDialog({ race, action, open, onOpenChange, onConfirm }: Props) {
    const [submitting, setSubmitting] = useState(false)
    const deleting = action === 'delete'

    const confirm = async () => {
        setSubmitting(true)
        try {
            await onConfirm()
            onOpenChange(false)
        } catch {
            // The caller reports the failure (toast); keep the confirmation open for another try.
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!submitting || next) onOpenChange(next)
            }}
        >
            <DialogContent
                role="alertdialog"
                showCloseButton={!submitting}
                data-testid={`race-confirm-dialog-${race.id}`}
                className="sm:max-w-md"
            >
                <DialogHeader>
                    <DialogTitle>
                        {deleting ? `Delete ${race.name}?` : `Cancel ${race.name}?`}
                    </DialogTitle>
                    <DialogDescription>
                        {deleting
                            ? 'This permanently removes the race. Planned sessions linked to it will remain, but will no longer be linked to this race.'
                            : 'This moves the race to your history. It will not be deleted.'}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid={`race-confirm-no-${race.id}`}
                        disabled={submitting}
                        onClick={() => onOpenChange(false)}
                    >
                        Keep race
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        data-testid={`race-confirm-yes-${race.id}`}
                        disabled={submitting}
                        onClick={() => void confirm()}
                    >
                        {submitting ? <Loader2Icon className="animate-spin" /> : null}
                        {submitting
                            ? deleting
                                ? 'Deleting...'
                                : 'Canceling...'
                            : deleting
                              ? 'Delete race'
                              : 'Cancel race'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
