import type { StrengthSetDTO } from '@/_bff/modules/training/types'

type Props = {
    strengthSets: StrengthSetDTO[]
}

type StrengthExerciseGroup = {
    key: string
    exercise: string
    exerciseIndex: number | null
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
        } else {
            groups.set(key, {
                key,
                exercise: set.exercise,
                exerciseIndex: set.exerciseIndex,
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
        <section aria-label="Strength exercises" className="space-y-4">
            <header className="flex items-baseline justify-between gap-4">
                <h2 className="display text-3xl">Exercises</h2>
                {exerciseGroups.length > 0 && (
                    <span
                        data-testid="strength-exercise-count"
                        className="text-sm text-muted-foreground"
                    >
                        {exerciseGroups.length}{' '}
                        {exerciseGroups.length === 1 ? 'exercise' : 'exercises'}
                    </span>
                )}
            </header>
            {exerciseGroups.length === 0 ? (
                <p data-testid="strength-sets-empty" className="text-sm text-muted-foreground">
                    No set data recorded for this strength workout.
                </p>
            ) : (
                <div data-testid="strength-exercises" className="divide-y divide-hairline">
                    {exerciseGroups.map((group, groupIndex) => (
                        <section
                            key={group.key}
                            aria-labelledby={`strength-exercise-${groupIndex + 1}-name`}
                            className="py-4 first:pt-0 last:pb-0"
                        >
                            <header className="mb-2 flex items-baseline justify-between gap-4">
                                <h3
                                    id={`strength-exercise-${groupIndex + 1}-name`}
                                    data-testid={`strength-exercise-${groupIndex + 1}-name`}
                                    className="font-semibold"
                                >
                                    {group.exercise}
                                </h3>
                                <span
                                    data-testid={`strength-exercise-${groupIndex + 1}-set-count`}
                                    className="shrink-0 text-xs text-muted-foreground"
                                >
                                    {group.sets.length} {group.sets.length === 1 ? 'set' : 'sets'}
                                </span>
                            </header>
                            <div className="overflow-x-auto">
                                <table
                                    data-testid={`strength-exercise-${groupIndex + 1}-table`}
                                    className="w-full text-sm"
                                >
                                    <thead className="eyebrow text-left text-muted-foreground">
                                        <tr>
                                            <th scope="col" className="py-2 pr-3">
                                                Set
                                            </th>
                                            <th scope="col" className="px-3 py-2">
                                                Reps
                                            </th>
                                            <th scope="col" className="px-3 py-2">
                                                Load
                                            </th>
                                            {hasRir && (
                                                <th
                                                    scope="col"
                                                    data-testid={`strength-exercise-${groupIndex + 1}-rir-header`}
                                                    className="py-2 pl-3 text-right"
                                                >
                                                    RIR
                                                </th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="font-mono">
                                        {group.sets.map((set) => (
                                            <tr
                                                key={set.setIndex}
                                                className="border-t border-hairline"
                                            >
                                                <td
                                                    data-testid={`strength-exercise-${groupIndex + 1}-set-${set.setIndex}-index`}
                                                    className="py-2 pr-3"
                                                >
                                                    {set.setIndex}
                                                </td>
                                                <td
                                                    data-testid={`strength-exercise-${groupIndex + 1}-set-${set.setIndex}-reps`}
                                                    className="px-3 py-2"
                                                >
                                                    {set.reps ?? DASH}
                                                </td>
                                                <td
                                                    data-testid={`strength-exercise-${groupIndex + 1}-set-${set.setIndex}-load`}
                                                    className="px-3 py-2"
                                                >
                                                    {set.loadKg === null
                                                        ? DASH
                                                        : `${formatStrengthNumber(set.loadKg)} kg`}
                                                </td>
                                                {hasRir && (
                                                    <td
                                                        data-testid={`strength-exercise-${groupIndex + 1}-set-${set.setIndex}-rir`}
                                                        className="py-2 pl-3 text-right"
                                                    >
                                                        {set.rir ?? DASH}
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </section>
    )
}
