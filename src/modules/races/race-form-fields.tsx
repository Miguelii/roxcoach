'use client'

import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'
import { HYROX_DIVISIONS } from '@/_bff/core/constants/hyrox.constants'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useRaceForm, type RaceFormValues } from '@/modules/races/use-race-form'
import { PRIORITY_LABELS, RACE_TYPE_LABELS } from '@/modules/races/utils'

type FormInstance = ReturnType<typeof useRaceForm>

type Props = {
    form: FormInstance
    defaultDivision: HyroxDivision | null
    raceType: RaceFormValues['raceType']
}

const TYPE_OPTIONS = Object.entries(RACE_TYPE_LABELS).map(([value, label]) => ({ value, label }))
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
    value,
    label: `${value}: ${label}`,
}))

export function RaceFormFields({ form, defaultDivision, raceType }: Props) {
    return (
        <>
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
                                    <SelectTrigger data-testid="race-form-type" className="w-full">
                                        <SelectValue>
                                            {TYPE_OPTIONS.find(
                                                (option) => option.value === field.value
                                            )?.label ?? field.value}
                                        </SelectValue>
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {TYPE_OPTIONS.map((option) => (
                                        <SelectItem
                                            key={option.value}
                                            value={option.value}
                                            data-testid={`race-form-type-option-${option.value}`}
                                        >
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
        </>
    )
}
