'use client'

import { Loader2Icon } from 'lucide-react'
import { HYROX_DIVISIONS } from '@/_bff/core/constants/hyrox.constants'
import { TIMEZONE_OPTIONS } from '@/_bff/core/constants/timezone.constants'
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
    parseProfileValues,
    useProfileForm,
    type ProfileFormValues,
    type ProfileValues,
} from '@/modules/settings/use-profile-form'

type Props = {
    defaults: ProfileFormValues
    onSubmit: (values: ProfileValues) => Promise<void>
}

// Select value standing for "not set" (an empty value is not a valid select item).
const NONE = 'none'

export function ProfileForm({ defaults, onSubmit }: Props) {
    const form = useProfileForm(defaults)

    const submit = async (raw: ProfileFormValues) => {
        const parsed = parseProfileValues(raw)
        if (!parsed.success) return
        try {
            await onSubmit(parsed.values)
        } catch {
            // The caller reports the outcome (toast), so a rejected save is swallowed here.
        }
    }

    // The saved zone is kept even when it is not one of the common zones.
    const timezones = TIMEZONE_OPTIONS.some((option) => option.value === defaults.timezone)
        ? TIMEZONE_OPTIONS
        : [{ value: defaults.timezone, label: defaults.timezone }, ...TIMEZONE_OPTIONS]

    return (
        <Form {...form}>
            <form
                data-testid="profile-form"
                onSubmit={form.handleSubmit(submit)}
                className="grid max-w-xl gap-4"
                noValidate
            >
                <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input data-testid="profile-name" {...field} />
                            </FormControl>
                            <FormMessage data-testid="profile-name-error" />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Timezone</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                    <SelectTrigger
                                        data-testid="profile-timezone"
                                        className="w-full"
                                    >
                                        <SelectValue>
                                            {timezones.find(
                                                (option) => option.value === field.value
                                            )?.label ?? field.value}
                                        </SelectValue>
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {timezones.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage data-testid="profile-timezone-error" />
                        </FormItem>
                    )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="maxHr"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Max heart rate (bpm)</FormLabel>
                                <FormControl>
                                    <Input
                                        data-testid="profile-max-hr"
                                        inputMode="numeric"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="profile-max-hr-error" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="restingHr"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Resting heart rate (bpm)</FormLabel>
                                <FormControl>
                                    <Input
                                        data-testid="profile-resting-hr"
                                        inputMode="numeric"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage data-testid="profile-resting-hr-error" />
                            </FormItem>
                        )}
                    />
                </div>
                <FormField
                    control={form.control}
                    name="hyroxDivision"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Hyrox division</FormLabel>
                            <Select
                                value={field.value === '' ? NONE : field.value}
                                onValueChange={(value) =>
                                    field.onChange(value === NONE ? '' : value)
                                }
                            >
                                <FormControl>
                                    <SelectTrigger
                                        data-testid="profile-division"
                                        className="w-full"
                                    >
                                        <SelectValue>
                                            {HYROX_DIVISIONS.find(
                                                (item) => item.key === field.value
                                            )?.label ?? 'Not set'}
                                        </SelectValue>
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value={NONE}>Not set</SelectItem>
                                    {HYROX_DIVISIONS.map((item) => (
                                        <SelectItem key={item.key} value={item.key}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage data-testid="profile-division-error" />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="weeklyHoursCap"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Weekly hours cap</FormLabel>
                            <FormControl>
                                <Input
                                    data-testid="profile-hours-cap"
                                    inputMode="decimal"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage data-testid="profile-hours-cap-error" />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notes for the coach</FormLabel>
                            <FormControl>
                                <Textarea data-testid="profile-notes" {...field} />
                            </FormControl>
                            <FormMessage data-testid="profile-notes-error" />
                        </FormItem>
                    )}
                />
                <div className="flex items-center gap-3">
                    <Button
                        className="w-full md:max-w-37.5"
                        type="submit"
                        data-testid="profile-submit"
                        disabled={form.formState.isSubmitting}
                    >
                        {form.formState.isSubmitting ? (
                            <Loader2Icon className="animate-spin" />
                        ) : null}
                        Save profile
                    </Button>
                </div>
            </form>
        </Form>
    )
}
