'use client'

import { useWatch } from 'react-hook-form'
import { Loader2Icon } from 'lucide-react'
import { formatClock } from '@/_bff/core/utils/formatters.utils'
import type { RaceDTO } from '@/_bff/modules/races/types'
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
import {
    parseResultTime,
    useCompleteRaceForm,
    type CompleteRaceValues,
} from '@/modules/races/use-complete-race-form'
import { formatDelta } from '@/modules/races/utils'

type Props = {
    race: RaceDTO | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (id: string, resultTimeS: number) => Promise<void>
}

type BodyProps = {
    race: RaceDTO
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (id: string, resultTimeS: number) => Promise<void>
}

function CompleteRaceBody({ race, open, onOpenChange, onSubmit }: BodyProps) {
    const form = useCompleteRaceForm()
    // useWatch, not form.watch: the React Compiler memoizes watch() and the delta would go stale.
    const typed = useWatch({ control: form.control, name: 'resultTime' })
    const delta = formatDelta(race.targetTimeS, parseResultTime(typed))
    const submitting = form.formState.isSubmitting

    const submit = async (values: CompleteRaceValues) => {
        const seconds = parseResultTime(values.resultTime)
        if (seconds === null) return
        try {
            await onSubmit(race.id, seconds)
            onOpenChange(false)
        } catch {
            // The caller reports the failure (toast); the dialog stays open for another try.
        }
    }

    return (
        <Form {...form}>
            <ConfirmDialog
                open={open}
                onOpenChange={onOpenChange}
                title={`Complete ${race.name}`}
                description={`Goal ${formatClock(race.targetTimeS)}`}
                descriptionTestId="complete-goal"
                testId="complete-dialog"
                cancelLabel="Cancel"
                cancelTestId="complete-cancel"
                busy={submitting}
                form={{ onSubmit: form.handleSubmit(submit), testId: 'complete-form' }}
                primaryAction={
                    <Button type="submit" data-testid="complete-submit" disabled={submitting}>
                        {submitting ? <Loader2Icon className="animate-spin" /> : null}
                        Save result
                    </Button>
                }
            >
                <FormField
                    control={form.control}
                    name="resultTime"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Result time (h:mm:ss)</FormLabel>
                            <FormControl>
                                <Input
                                    data-testid="complete-result"
                                    placeholder="1:12:30"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage data-testid="complete-result-error" />
                        </FormItem>
                    )}
                />
                {delta ? (
                    <p data-testid="complete-delta" className="text-sm text-muted-foreground">
                        {delta}
                    </p>
                ) : null}
            </ConfirmDialog>
        </Form>
    )
}

export function CompleteRaceDialog({ race, open, onOpenChange, onSubmit }: Props) {
    return race ? (
        <CompleteRaceBody race={race} open={open} onOpenChange={onOpenChange} onSubmit={onSubmit} />
    ) : null
}
