'use client'

import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
    clearing: boolean
    provider: 'Lyfta' | 'Zepp'
    items: 'workouts' | 'runs'
    // What goes with each activity: its sets or its laps.
    extra: 'sets' | 'laps'
    count: number
    testIdPrefix: string
}

const singular = (items: Props['items']) => items.slice(0, -1)

// Asks before deleting every activity an integration imported: a popup on desktop and a sheet from
// the bottom on a phone.
export function ClearActivitiesDialog({
    open,
    onOpenChange,
    onConfirm,
    clearing,
    provider,
    items,
    extra,
    count,
    testIdPrefix,
}: Props) {
    const noun = count === 1 ? singular(items) : items

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Clear ${count} ${provider} ${noun}?`}
            description={`They are removed from your training history, with their ${extra}. Run Sync to bring back the last 360 days; older ${items} and anything you added to them by hand are lost.`}
            descriptionTestId={`${testIdPrefix}-clear-description`}
            testId={`${testIdPrefix}-clear-dialog`}
            cancelLabel="Keep activities"
            cancelTestId={`${testIdPrefix}-clear-cancel`}
            busy={clearing}
            primaryAction={
                <Button
                    type="button"
                    variant="destructive"
                    data-testid={`${testIdPrefix}-clear-confirm`}
                    disabled={clearing}
                    onClick={onConfirm}
                >
                    {clearing ? <Loader2Icon className="animate-spin" /> : null}
                    {clearing ? 'Clearing...' : `Clear ${provider} activities`}
                </Button>
            }
        />
    )
}
