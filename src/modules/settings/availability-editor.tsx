'use client'

import { useState } from 'react'
import { IconMoon, IconPlus, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WEEKDAY_LABELS } from '@/modules/calendar/date-utils'
import { CATEGORIES, KINDS } from '@/modules/calendar/kinds'
import { AVAILABILITY } from '@/modules/mock/data'
import type { AvailabilitySlot, Category } from '@/modules/mock/types'

type SlotProps = {
    slot: AvailabilitySlot
    onRemove: () => void
}

function SlotChip({ slot, onRemove }: SlotProps) {
    if (slot.kind === 'rest') {
        return (
            <div
                data-tone="slate"
                className="flex items-center gap-1.5 rounded-lg bg-tone-soft px-2 py-1.5 text-xs text-tone-deep"
            >
                <IconMoon className="size-3.5" /> Rest day
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label="Remove rest day"
                    className="ml-auto"
                >
                    <IconX className="size-3.5" />
                </button>
            </div>
        )
    }

    const { Icon, tone, label } = KINDS[slot.kind]

    return (
        <div
            data-tone={tone}
            className={
                slot.fixed
                    ? 'flex items-center gap-1.5 rounded-lg bg-tone-soft px-2 py-1.5 text-xs text-tone-deep'
                    : 'flex items-center gap-1.5 rounded-lg border border-dashed border-tone/60 px-2 py-1.5 text-xs text-tone-deep'
            }
        >
            <Icon className="size-3.5 shrink-0" />
            <span>
                <span className="font-semibold">{label}</span>
                <span className="block font-mono text-[10px]">
                    {slot.fixed ? 'Fixed' : 'Open'}
                    {slot.maxMinutes && `, up to ${slot.maxMinutes}m`}
                </span>
            </span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${label}`}
                className="ml-auto"
            >
                <IconX className="size-3.5" />
            </button>
        </div>
    )
}

export function AvailabilityEditor() {
    const [slots, setSlots] = useState<AvailabilitySlot[]>(AVAILABILITY)

    const addSlot = (weekday: number, kind: Category | 'rest', fixed: boolean) =>
        setSlots((current) => {
            const others = current.filter(
                (slot) => slot.weekday !== weekday || (kind !== 'rest' && slot.kind !== 'rest')
            )
            if (others.some((slot) => slot.weekday === weekday && slot.kind === kind))
                return current

            return [
                ...(kind === 'rest' ? current.filter((slot) => slot.weekday !== weekday) : others),
                { weekday, kind, fixed, maxMinutes: kind === 'rest' ? null : 60, notes: null },
            ]
        })

    const removeSlot = (weekday: number, kind: Category | 'rest') =>
        setSlots((current) =>
            current.filter((slot) => !(slot.weekday === weekday && slot.kind === kind))
        )

    const trainingSlots = slots.filter((slot) => slot.kind !== 'rest')
    const minutes = trainingSlots.reduce((sum, slot) => sum + (slot.maxMinutes ?? 0), 0)

    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-7">
                {WEEKDAY_LABELS.map((label, index) => {
                    const weekday = index + 1
                    const daySlots = slots.filter((slot) => slot.weekday === weekday)

                    return (
                        <div
                            key={label}
                            className="space-y-2 rounded-[var(--radius-surface-inner)] border border-ink/10 bg-card p-2.5"
                        >
                            <p className="eyebrow text-muted-foreground">{label}</p>
                            {daySlots.map((slot) => (
                                <SlotChip
                                    key={slot.kind}
                                    slot={slot}
                                    onRemove={() => removeSlot(weekday, slot.kind)}
                                />
                            ))}
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full"
                                            aria-label={`Add slot on ${label}`}
                                        />
                                    }
                                >
                                    <IconPlus /> Add
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-52">
                                    <DropdownMenuGroup>
                                        <DropdownMenuLabel>
                                            Open slot (coach may use)
                                        </DropdownMenuLabel>
                                        {CATEGORIES.map((kind) => (
                                            <DropdownMenuItem
                                                key={`open-${kind}`}
                                                onClick={() => addSlot(weekday, kind, false)}
                                            >
                                                {KINDS[kind].label}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuGroup>
                                    <DropdownMenuGroup>
                                        <DropdownMenuLabel>Fixed commitment</DropdownMenuLabel>
                                        {CATEGORIES.map((kind) => (
                                            <DropdownMenuItem
                                                key={`fixed-${kind}`}
                                                onClick={() => addSlot(weekday, kind, true)}
                                            >
                                                {KINDS[kind].label}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuGroup>
                                    <DropdownMenuItem
                                        onClick={() => addSlot(weekday, 'rest', false)}
                                    >
                                        Rest day
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )
                })}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                    {trainingSlots.length} sessions per week, up to {Math.round(minutes / 6) / 10}{' '}
                    h.
                </p>
                <Button
                    variant="ink"
                    className="ml-auto"
                    onClick={() => toast.success('Mockup: availability saved, plan marked stale')}
                >
                    Save availability
                </Button>
            </div>
        </div>
    )
}
