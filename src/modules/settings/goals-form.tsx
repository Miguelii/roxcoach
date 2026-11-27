'use client'

import { Loader2Icon } from 'lucide-react'
import { useWatch } from 'react-hook-form'
import type { RunTypeRules, WeeklyGoals } from '@/_bff/core/constants/weekly-goals.constants'
import { parseClock } from '@/_bff/core/utils/formatters.utils'
import { describeRunTypeRules } from '@/_bff/core/utils/weekly-goals.utils'
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
    parseGoalsValues,
    useGoalsForm,
    type GoalsFormValues,
} from '@/modules/settings/use-goals-form'

type Props = {
    defaults: GoalsFormValues
    onSubmit: (values: WeeklyGoals) => Promise<void>
}

type FieldSpec = {
    name: keyof GoalsFormValues
    label: string
    testId: string
    inputMode: 'decimal' | 'numeric' | 'text'
}

const GOAL_FIELDS: FieldSpec[] = [
    {
        name: 'weeklyRunKm',
        label: 'Running distance (km)',
        testId: 'goals-weekly-km',
        inputMode: 'decimal',
    },
    {
        name: 'longRunsPerWeek',
        label: 'Long runs per week',
        testId: 'goals-long-runs',
        inputMode: 'numeric',
    },
    {
        name: 'fastRunsPerWeek',
        label: 'Fast runs per week',
        testId: 'goals-fast-runs',
        inputMode: 'numeric',
    },
    {
        name: 'strengthSessionsPerWeek',
        label: 'Strength sessions per week',
        testId: 'goals-strength-sessions',
        inputMode: 'numeric',
    },
]

const RUN_TYPE_FIELDS: FieldSpec[] = [
    {
        name: 'shortRunMaxKm',
        label: 'Short run under (km)',
        testId: 'goals-short-run-km',
        inputMode: 'decimal',
    },
    {
        name: 'longRunMinKm',
        label: 'Long run over (km)',
        testId: 'goals-long-run-km',
        inputMode: 'decimal',
    },
    {
        name: 'fastPace',
        label: 'Fast pace under (min:sec per km)',
        testId: 'goals-fast-pace',
        inputMode: 'text',
    },
]

// Reads the rules being typed so the summary follows the inputs; null while any is not a value yet.
const previewRules = (shortKm: string, longKm: string, pace: string): RunTypeRules | null => {
    const shortRunMaxM = Math.round(Number(shortKm) * 1000)
    const longRunMinM = Math.round(Number(longKm) * 1000)
    const fastPaceSPerKm = parseClock(pace)
    if (shortKm.trim() === '' || longKm.trim() === '') return null
    if (!Number.isFinite(shortRunMaxM) || !Number.isFinite(longRunMinM) || fastPaceSPerKm === null)
        return null
    return { shortRunMaxM, longRunMinM, fastPaceSPerKm }
}

export function GoalsForm({ defaults, onSubmit }: Props) {
    const form = useGoalsForm(defaults)
    const [shortKm, longKm, pace] = useWatch({
        control: form.control,
        name: ['shortRunMaxKm', 'longRunMinKm', 'fastPace'],
    })
    const rules = previewRules(shortKm, longKm, pace)

    const submit = async (raw: GoalsFormValues) => {
        const parsed = parseGoalsValues(raw)
        if (!parsed.success) return
        try {
            await onSubmit(parsed.values)
        } catch {
            // The caller reports the outcome (toast), so a rejected save is swallowed here.
        }
    }

    const renderField = ({ name, label, testId, inputMode }: FieldSpec) => (
        <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                        <Input data-testid={testId} inputMode={inputMode} {...field} />
                    </FormControl>
                    <FormMessage data-testid={`${testId}-error`} />
                </FormItem>
            )}
        />
    )

    return (
        <Form {...form}>
            <form
                data-testid="goals-form"
                onSubmit={form.handleSubmit(submit)}
                className="grid max-w-xl gap-8"
                noValidate
            >
                <section className="grid gap-4">
                    <div className="space-y-1">
                        <h2 className="type-heading">Weekly goals</h2>
                        <p className="text-sm text-muted-foreground">Leave empty for no goal.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {GOAL_FIELDS.map((spec) => renderField(spec))}
                    </div>
                </section>
                <section className="grid gap-4">
                    <h2 className="type-heading">Run types</h2>
                    <div className="grid gap-4 sm:grid-cols-3">
                        {RUN_TYPE_FIELDS.map((spec) => renderField(spec))}
                    </div>
                    <p data-testid="goals-rule-summary" className="text-sm text-muted-foreground">
                        {rules === null ? null : describeRunTypeRules(rules)}
                    </p>
                </section>
                <div className="flex items-center gap-3">
                    <Button
                        className="w-full md:max-w-37.5"
                        type="submit"
                        data-testid="goals-save"
                        disabled={form.formState.isSubmitting}
                    >
                        {form.formState.isSubmitting ? (
                            <Loader2Icon className="animate-spin" />
                        ) : null}
                        Save goals
                    </Button>
                </div>
            </form>
        </Form>
    )
}
