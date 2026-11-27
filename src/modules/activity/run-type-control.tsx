'use client'

import type { ActivityDTO } from '@/_bff/modules/training/types'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

type RunTypeChoice = 'long' | 'fast' | 'none'

type Props = {
    activityId: string
    runType: ActivityDTO['runType']
    manual: boolean
    onChange: (value: RunTypeChoice | 'auto') => void
    pending: boolean
}

const OPTIONS: { value: RunTypeChoice; label: string }[] = [
    { value: 'long', label: 'Long run' },
    { value: 'fast', label: 'Fast run' },
    { value: 'none', label: 'None' },
]

export function RunTypeControl({ activityId, runType, manual, onChange, pending }: Props) {
    const value: RunTypeChoice = runType ?? 'none'
    const triggerId = `run-type-${activityId}`

    return (
        <section aria-label="Run type" className="space-y-2">
            <label htmlFor={triggerId} className="eyebrow text-muted-foreground">
                Run type
            </label>
            <Select
                value={value}
                disabled={pending}
                onValueChange={(next) => {
                    const picked = OPTIONS.find((option) => option.value === next)
                    if (picked && picked.value !== value) onChange(picked.value)
                }}
            >
                <SelectTrigger id={triggerId} data-testid="run-type-select" className="min-w-40">
                    <SelectValue>
                        {OPTIONS.find((option) => option.value === value)?.label}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {OPTIONS.map((option) => (
                        <SelectItem
                            key={option.value}
                            value={option.value}
                            data-testid={`run-type-option-${option.value}`}
                        >
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p
                data-testid="run-type-hint"
                className="flex items-center gap-2 text-sm text-muted-foreground"
            >
                {manual ? 'Set by you' : 'Set automatically from your rules'}
                {manual && (
                    <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        data-testid="run-type-reset"
                        disabled={pending}
                        onClick={() => onChange('auto')}
                    >
                        Use my rules
                    </Button>
                )}
            </p>
        </section>
    )
}
