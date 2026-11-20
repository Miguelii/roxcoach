'use client'

import { Loader2Icon } from 'lucide-react'
import { HYROX_DIVISIONS, type HyroxDivision } from '@/_bff/core/constants/hyrox.constants'
import type { RaceInput } from '@/_bff/modules/races/types'
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
    emptyRaceFormValues,
    toRaceInput,
    useRaceForm,
    type RaceFormValues,
} from '@/modules/races/use-race-form'
import { PRIORITY_LABELS, RACE_TYPE_LABELS } from '@/modules/races/utils'

type Props = {
    mode: 'create' | 'edit'
    // Null in create mode: the form starts empty with the profile division.
    defaults: RaceFormValues | null
    today: string
    defaultDivision: HyroxDivision | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (input: RaceInput) => Promise<void>
}

type BodyProps = Omit<Props, 'open' | 'onOpenChange'> & { onClose: () => void }

const TYPE_OPTIONS = Object.entries(RACE_TYPE_LABELS).map(([value, label]) => ({ value, label }))
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
    value,
    label: `${value}: ${label}`,
}))

function RaceFormBody({ mode, defaults, today, defaultDivision, onSubmit, onClose }: BodyProps) {
    const form = useRaceForm(defaults ?? emptyRaceFormValues(defaultDivision), today)
    const raceType = form.watch('raceType')

    const submit = async (values: RaceFormValues) => {
        try {
            await onSubmit(toRaceInput(values))
            onClose()
        } catch {
            // The caller reports the failure (toast); the dialog stays open for another try.
        }
    }

    return (
        <Form {...form}>
            <form
                data-testid="race-form"
                onSubmit={form.handleSubmit(submit)}
                className="grid gap-4"
                noValidate
            >
                <DialogHeader>
                    <DialogTitle>{mode === 'create' ? 'New race' : 'Edit race'}</DialogTitle>
                    <DialogDescription>
                        The coach plans around the date, the goal time and the priority.
                    </DialogDescription>
                </DialogHeader>
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input data-testid="race-form-name" {...field} />
                            </FormControl>
                            <FormMessage data-testid="race-form-name-error" />
                        </FormItem>
                    )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="raceType"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Type</FormLabel>
                                <Select
                                    value={field.value}
                                    onValueChange={(value) => {
                                        field.onChange(value)
                                        if (
                                            value === 'hyrox' &&
                                            form.getValues('hyroxDivision') === '' &&
                                            defaultDivision
                                        )
                                            form.setValue('hyroxDivision', defaultDivision)
                                    }}
                                >
                                    <FormControl>
                                        <SelectTrigger
                                            data-testid="race-form-type"
                                            className="w-full"
                                        >
                                            <SelectValue>
                                                {TYPE_OPTIONS.find(
                                                    (option) => option.value === field.value
                                                )?.label ?? field.value}
                                            </SelectValue>
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {TYPE_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage data-testid="race-form-type-error" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="raceDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Date</FormLabel>
                                <FormControl>
                                    <Input type="date" data-testid="race-form-date" {...field} />
                                </FormControl>
                                <FormMessage data-testid="race-form-date-error" />
                            </FormItem>
                        )}
                    />
                </div>
                {raceType === 'running' ? (
                    <FormField
                        control={form.control}
                        name="distanceKm"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Distance (km)</FormLabel>
                                <FormControl>
                                    <Input
                                        data-testid="race-form-distance"
                                        inputMode="decimal"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="race-form-distance-error" />
                            </FormItem>
                        )}
                    />
                ) : null}
                {raceType === 'hyrox' ? (
                    <FormField
                        control={form.control}
                        name="hyroxDivision"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Division</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger
                                            data-testid="race-form-division"
                                            className="w-full"
                                        >
                                            <SelectValue>
                                                {HYROX_DIVISIONS.find(
                                                    (item) => item.key === field.value
                                                )?.label ?? 'Choose a division'}
                                            </SelectValue>
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {HYROX_DIVISIONS.map((item) => (
                                            <SelectItem key={item.key} value={item.key}>
                                                {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage data-testid="race-form-division-error" />
                            </FormItem>
                        )}
                    />
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="targetTime"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Goal time (h:mm:ss)</FormLabel>
                                <FormControl>
                                    <Input
                                        data-testid="race-form-goal"
                                        placeholder="1:10:00"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="race-form-goal-error" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Priority</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger
                                            data-testid="race-form-priority"
                                            className="w-full"
                                        >
                                            <SelectValue>
                                                {PRIORITY_OPTIONS.find(
                                                    (option) => option.value === field.value
                                                )?.label ?? field.value}
                                            </SelectValue>
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {PRIORITY_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage data-testid="race-form-priority-error" />
                            </FormItem>
                        )}
                    />
                </div>
                <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Location</FormLabel>
                            <FormControl>
                                <Input data-testid="race-form-location" {...field} />
                            </FormControl>
                            <FormMessage data-testid="race-form-location-error" />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notes</FormLabel>
                            <FormControl>
                                <Textarea data-testid="race-form-notes" {...field} />
                            </FormControl>
                            <FormMessage data-testid="race-form-notes-error" />
                        </FormItem>
                    )}
                />
                <DialogFooter>
                    <Button
                        type="submit"
                        data-testid="race-form-submit"
                        disabled={form.formState.isSubmitting}
                    >
                        {form.formState.isSubmitting ? (
                            <Loader2Icon className="animate-spin" />
                        ) : null}
                        {mode === 'create' ? 'Add race' : 'Save race'}
                    </Button>
                </DialogFooter>
            </form>
        </Form>
    )
}

export function RaceFormDialog({ open, onOpenChange, ...rest }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="race-form-dialog">
                <RaceFormBody {...rest} onClose={() => onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    )
}
