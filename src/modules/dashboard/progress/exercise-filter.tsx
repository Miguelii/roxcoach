'use client'

import { useState } from 'react'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'
import { Button } from '@/components/ui/button'
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useIsMobile } from '@/hooks/use-mobile'
import { ExerciseThumb } from '@/modules/dashboard/progress/exercise-thumb'
import { cn } from '@/lib/utils'

// The value that stands for "the top exercises" rather than one exercise.
export const TOP_FILTER = 'top'

type Props = {
    exercises: TopExerciseDTO[]
    // `TOP_FILTER` or the key of one exercise.
    value: string
    onChange: (value: string) => void
    // How many exercises "Top" shows.
    topCount: number
}

type Option = { value: string; label: string; exercise: TopExerciseDTO | null }

const optionsOf = (exercises: TopExerciseDTO[], topCount: number): Option[] => [
    { value: TOP_FILTER, label: `Top ${Math.min(topCount, exercises.length)}`, exercise: null },
    ...exercises.map((exercise) => ({ value: exercise.key, label: exercise.name, exercise })),
]

// Chooses which exercises the strength dashboard shows: the top ones (the first option) or one.
// A dropdown on a wide screen; on a phone a button that opens a list in a bottom drawer.
export function ExerciseFilter({ exercises, value, onChange, topCount }: Props) {
    const isMobile = useIsMobile()
    const [open, setOpen] = useState(false)
    const options = optionsOf(exercises, topCount)
    const current = options.find((option) => option.value === value) ?? options[0]
    if (current === undefined) return null

    if (!isMobile)
        return (
            <Select
                value={current.value}
                onValueChange={(next) => {
                    if (next !== null) onChange(next)
                }}
            >
                <SelectTrigger
                    data-testid="exercise-filter"
                    aria-label="Exercises shown"
                    className="w-56"
                >
                    <SelectValue>{current.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem
                            key={option.value}
                            value={option.value}
                            data-testid={`exercise-filter-option-${option.value}`}
                        >
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        )

    return (
        <>
            <Button
                type="button"
                variant="outline"
                data-testid="exercise-filter"
                aria-label="Exercises shown"
                aria-haspopup="dialog"
                className="h-11 w-full justify-between"
                onClick={() => setOpen(true)}
            >
                <span className="truncate">{current.label}</span>
                <IconChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            </Button>
            <Drawer open={open} onOpenChange={setOpen}>
                <DrawerContent data-testid="exercise-filter-drawer" className="bg-paper">
                    <DrawerHeader className="gap-1 pt-2">
                        <DrawerTitle className="display text-xl">Show exercise</DrawerTitle>
                        <DrawerDescription>
                            The top ones together, or just one lift.
                        </DrawerDescription>
                    </DrawerHeader>
                    <ul className="max-h-[55dvh] divide-y divide-hairline overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        {options.map((option) => {
                            const selected = option.value === current.value
                            return (
                                <li key={option.value}>
                                    <button
                                        type="button"
                                        data-testid={`exercise-filter-option-${option.value}`}
                                        aria-pressed={selected}
                                        onClick={() => {
                                            onChange(option.value)
                                            setOpen(false)
                                        }}
                                        className={cn(
                                            'flex min-h-14 w-full items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-muted/50',
                                            selected && 'font-medium'
                                        )}
                                    >
                                        <ExerciseThumb
                                            imageUrl={option.exercise?.imageUrl ?? null}
                                            testId={`exercise-filter-thumb-${option.value}`}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm">
                                                {option.label}
                                            </span>
                                            {option.exercise === null ? null : (
                                                <span className="block text-xs text-muted-foreground">
                                                    {option.exercise.workouts} workouts
                                                </span>
                                            )}
                                        </span>
                                        {selected ? (
                                            <IconCheck
                                                className="size-5 shrink-0"
                                                aria-hidden="true"
                                            />
                                        ) : null}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </DrawerContent>
            </Drawer>
        </>
    )
}
