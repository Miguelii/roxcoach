import Image from 'next/image'
import { IconBarbell } from '@tabler/icons-react'
import type { StrengthSetDTO } from '@/_bff/modules/training/types'

type Props = {
    strengthSets: StrengthSetDTO[]
}

type StrengthExerciseGroup = {
    key: string
    exercise: string
    exerciseIndex: number | null
    exerciseImageUrl: string | null
    sets: StrengthSetDTO[]
}

const DASH = '-'
const STRENGTH_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
})

function groupStrengthSets(sets: StrengthSetDTO[]): StrengthExerciseGroup[] {
    const groups = new Map<string, StrengthExerciseGroup>()

    for (const set of sets) {
        const key =
            set.exerciseIndex !== null
                ? `order:${set.exerciseIndex}`
                : set.sourceExerciseId === null
                  ? `name:${set.exercise.toLowerCase()}`
                  : `source:${set.sourceExerciseId}`
        const group = groups.get(key)

        if (group) {
            group.sets.push(set)
            if (group.exerciseImageUrl === null) {
                group.exerciseImageUrl = set.exerciseImageUrl
            }
        } else {
            groups.set(key, {
                key,
                exercise: set.exercise,
                exerciseIndex: set.exerciseIndex,
                exerciseImageUrl: set.exerciseImageUrl,
                sets: [set],
            })
        }
    }

    return [...groups.values()]
        .map((group) => ({
            ...group,
            sets: group.sets.toSorted((a, b) => a.setIndex - b.setIndex),
        }))
        .toSorted((a, b) => {
            if (a.exerciseIndex === null) {
                return b.exerciseIndex === null ? a.exercise.localeCompare(b.exercise) : 1
            }
            if (b.exerciseIndex === null) return -1
            return a.exerciseIndex - b.exerciseIndex
        })
}

const formatStrengthNumber = (value: number) => STRENGTH_NUMBER_FORMATTER.format(value)

export function StrengthExercises({ strengthSets }: Props) {
    const exerciseGroups = groupStrengthSets(strengthSets)
    const hasRir = strengthSets.some((set) => set.rir !== null)

    return (
        <section aria-label="Strength exercises" className="space-y-5">
            {exerciseGroups.length === 0 ? (
                <p data-testid="strength-sets-empty" className="text-sm text-muted-foreground">
                    No set data recorded for this strength workout.
                </p>
            ) : (
                <div data-testid="strength-exercises" className="space-y-5">
                    {exerciseGroups.map((group, groupIndex) => (
                        <section
                            key={group.key}
                            aria-labelledby={`strength-exercise-${groupIndex + 1}-name`}
                            className="space-y-2"
                        >
                            <header className="flex min-h-24 items-center gap-4 rounded-[var(--radius-surface-inner)] bg-muted p-3 sm:gap-5 sm:p-4">
                                <div
                                    data-testid={`strength-exercise-${groupIndex + 1}-image-frame`}
                                    className="relative size-20 shrink-0 overflow-hidden rounded-md border border-hairline bg-background sm:size-24"
                                >
                                    {group.exerciseImageUrl ? (
                                        <Image
                                            data-testid={`strength-exercise-${groupIndex + 1}-image`}
                                            src={group.exerciseImageUrl}
                                            alt={`${group.exercise} demonstration`}
                                            fill
                                            sizes="(min-width: 640px) 96px, 80px"
                                            className="object-contain p-1"
                                        />
                                    ) : (
                                        <IconBarbell
                                            data-testid={`strength-exercise-${groupIndex + 1}-image-placeholder`}
                                            aria-hidden="true"
                                            className="absolute inset-0 m-auto size-8 text-muted-foreground"
                                        />
                                    )}
                                </div>
                                <h3
                                    id={`strength-exercise-${groupIndex + 1}-name`}
                                    data-testid={`strength-exercise-${groupIndex + 1}-name`}
                                    className="min-w-0 text-lg font-semibold leading-snug sm:text-xl"
                                >
                                    {group.exercise}
                                </h3>
                            </header>
                            <ol className="grid gap-1">
                                {group.sets.map((set) => (
                                    <li
                                        key={set.setIndex}
                                        className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-3 px-2 py-1.5 sm:px-4"
                                    >
                                        <span
                                            data-testid={`strength-exercise-${groupIndex + 1}-set-${set.setIndex}-index`}
                                            className="font-semibold tabular-nums"
                                        >
                                            {set.setIndex}
                                        </span>
                                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                            <p className="font-mono text-base sm:text-lg">
                                                <span
                                                    data-testid={`strength-exercise-${groupIndex + 1}-set-${set.setIndex}-load`}
                                                >
                                                    {set.loadKg === null
                                                        ? DASH
                                                        : `${formatStrengthNumber(set.loadKg)} kg`}
                                                </span>{' '}
                                                x{' '}
                                                <span
                                                    data-testid={`strength-exercise-${groupIndex + 1}-set-${set.setIndex}-reps`}
                                                >
                                                    {set.reps ?? DASH} reps
                                                </span>
                                            </p>
                                            {hasRir && (
                                                <span
                                                    data-testid={`strength-exercise-${groupIndex + 1}-set-${set.setIndex}-rir`}
                                                    className="text-sm text-muted-foreground"
                                                >
                                                    RIR {set.rir ?? DASH}
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    ))}
                </div>
            )}
        </section>
    )
}
