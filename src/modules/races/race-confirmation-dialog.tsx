'use client'

import { useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

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
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={deleting ? `Delete ${race.name}?` : `Cancel ${race.name}?`}
            description={
                deleting
                    ? 'This permanently removes the race. Your coach will no longer see it. This cannot be undone.'
                    : 'This moves the race to your history. It will not be deleted.'
            }
            testId={`race-confirm-dialog-${race.id}`}
            cancelLabel="Keep race"
            cancelTestId={`race-confirm-no-${race.id}`}
            busy={submitting}
            primaryAction={
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
            }
        />
    )
}
