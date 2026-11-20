'use client'

import { Loader2Icon, PlusIcon, XIcon } from 'lucide-react'
import { SESSION_KINDS, type SessionKind } from '@/_bff/core/constants/availability.constants'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { addSlot, removeSlot, summarize } from '@/modules/settings/use-availability-editor'

type Props = {
    slots: AvailabilitySlotDTO[]
    onChange: (slots: AvailabilitySlotDTO[]) => void
    onSave: () => void
    saving: boolean
}

const WEEKDAYS = [
    { weekday: 1, label: 'Mon' },
    { weekday: 2, label: 'Tue' },
    { weekday: 3, label: 'Wed' },
    { weekday: 4, label: 'Thu' },
    { weekday: 5, label: 'Fri' },
    { weekday: 6, label: 'Sat' },
    { weekday: 7, label: 'Sun' },
]

const KIND_LABELS: Record<SessionKind, string> = {
    hyrox: 'Hyrox',
    run: 'Run',
    strength: 'Strength',
    cross: 'Cross-training',
    rest: 'Rest day',
}

const TRAINING_KINDS = SESSION_KINDS.filter((kind) => kind !== 'rest')

export function AvailabilityEditorView({ slots, onChange, onSave, saving }: Props) {
    const { sessions, hours } = summarize(slots)

    return (
        <div data-testid="availability-editor" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                {WEEKDAYS.map(({ weekday, label }) => {
                    const daySlots = slots.filter((slot) => slot.weekday === weekday)
                    return (
                        <div
                            key={weekday}
                            data-testid={`availability-day-${weekday}`}
                            className="flex min-h-32 flex-col gap-2 rounded-lg border border-hairline bg-card p-3"
                        >
                            <p className="text-sm font-medium">{label}</p>
                            <div className="flex flex-1 flex-col gap-1.5">
                                {daySlots.map((slot) => (
                                    <span
                                        key={slot.sessionKind}
                                        data-testid={`availability-slot-${weekday}-${slot.sessionKind}`}
                                        className={cn(
                                            'flex items-center justify-between gap-1 rounded-md border px-2 py-1 text-xs',
                                            slot.isFixed
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'bg-muted text-muted-foreground'
                                        )}
                                    >
                                        <span>
                                            {KIND_LABELS[slot.sessionKind]}
                                            {slot.isFixed ? ' (fixed)' : ''}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label={`Remove ${KIND_LABELS[slot.sessionKind]}`}
                                            data-testid={`availability-remove-${weekday}-${slot.sessionKind}`}
                                            className="cursor-pointer"
                                            onClick={() =>
                                                onChange(
                                                    removeSlot(slots, weekday, slot.sessionKind)
                                                )
                                            }
                                        >
                                            <XIcon className="size-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            data-testid={`availability-add-${weekday}`}
                                        />
                                    }
                                >
                                    <PlusIcon />
                                    Add
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuGroup>
                                        <DropdownMenuLabel>Open slot</DropdownMenuLabel>
                                        {TRAINING_KINDS.map((kind) => (
                                            <DropdownMenuItem
                                                key={kind}
                                                data-testid={`availability-add-${weekday}-open-${kind}`}
                                                onClick={() =>
                                                    onChange(addSlot(slots, weekday, kind, false))
                                                }
                                            >
                                                {KIND_LABELS[kind]}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                        <DropdownMenuLabel>Fixed commitment</DropdownMenuLabel>
                                        {TRAINING_KINDS.map((kind) => (
                                            <DropdownMenuItem
                                                key={kind}
                                                data-testid={`availability-add-${weekday}-fixed-${kind}`}
                                                onClick={() =>
                                                    onChange(addSlot(slots, weekday, kind, true))
                                                }
                                            >
                                                {KIND_LABELS[kind]}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        data-testid={`availability-add-${weekday}-rest`}
                                        onClick={() =>
                                            onChange(addSlot(slots, weekday, 'rest', false))
                                        }
                                    >
                                        {KIND_LABELS.rest}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )
                })}
            </div>
            {slots.length === 0 ? (
                <p data-testid="availability-empty" className="text-sm text-muted-foreground">
                    No availability yet. Add the days and sessions you can train so the coach can
                    plan around them.
                </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p data-testid="availability-summary" className="text-sm text-muted-foreground">
                    {sessions} {sessions === 1 ? 'session' : 'sessions'} per week
                    {hours === null ? '' : `, up to ${hours} h`}
                </p>
                <Button
                    className="w-full md:max-w-37.5"
                    type="button"
                    data-testid="availability-save"
                    disabled={saving}
                    onClick={onSave}
                >
                    {saving ? <Loader2Icon className="animate-spin" /> : null}
                    Save availability
                </Button>
            </div>
        </div>
    )
}
