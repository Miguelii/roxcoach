'use client'

import { useWatch } from 'react-hook-form'
import { Loader2Icon } from 'lucide-react'
import { formatClock } from '@/_bff/core/utils/formatters.utils'
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
    onClose: () => void
    onSubmit: (id: string, resultTimeS: number) => Promise<void>
}

function CompleteRaceBody({ race, onClose, onSubmit }: BodyProps) {
    const form = useCompleteRaceForm()
    // useWatch, not form.watch: the React Compiler memoizes watch() and the delta would go stale.
    const typed = useWatch({ control: form.control, name: 'resultTime' })
    const delta = formatDelta(race.targetTimeS, parseResultTime(typed))

    const submit = async (values: CompleteRaceValues) => {
        const seconds = parseResultTime(values.resultTime)
        if (seconds === null) return
        try {
            await onSubmit(race.id, seconds)
            onClose()
        } catch {
            // The caller reports the failure (toast); the dialog stays open for another try.
        }
    }

    return (
        <Form {...form}>
            <form
                data-testid="complete-form"
                onSubmit={form.handleSubmit(submit)}
                className="grid gap-4"
                noValidate
            >
                <DialogHeader>
                    <DialogTitle>Complete {race.name}</DialogTitle>
                    <DialogDescription data-testid="complete-goal">
                        Goal {formatClock(race.targetTimeS)}
                    </DialogDescription>
                </DialogHeader>
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
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="complete-cancel"
                        disabled={form.formState.isSubmitting}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        data-testid="complete-submit"
                        disabled={form.formState.isSubmitting}
                    >
                        {form.formState.isSubmitting ? (
                            <Loader2Icon className="animate-spin" />
                        ) : null}
                        Save result
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    )
}

export function CompleteRaceDialog({ race, open, onOpenChange, onSubmit }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="complete-dialog" className="md:max-w-md">
                {race ? (
                    <CompleteRaceBody
                        race={race}
                        onClose={() => onOpenChange(false)}
                        onSubmit={onSubmit}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    )
}
