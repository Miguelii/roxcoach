import type { TopExerciseDTO } from '@/_bff/modules/training/types/progress'

export type ExerciseMode = 'kg' | 'percent'

export type ExerciseRow = { date: string; values: (number | null)[] }

type ExerciseSummary = { latestKg: number; changeKg: number | null; changePct: number | null }

const round1 = (value: number) => Math.round(value * 10) / 10

// One row per workout date that has any of the exercises, ascending. `values[i]` belongs to
// `exercises[i]`: its heaviest set (kg) or its change since its first workout (percent), null when
// that exercise was not trained that day.
export const buildExerciseRows = (
    exercises: TopExerciseDTO[],
    mode: ExerciseMode
): ExerciseRow[] => {
    const dates = [
        ...new Set(exercises.flatMap((exercise) => exercise.points.map((p) => p.date))),
    ].toSorted()

    return dates.map((date) => ({
        date,
        values: exercises.map((exercise) => {
            const point = exercise.points.find((p) => p.date === date)
            const first = exercise.points[0]
            if (point === undefined || first === undefined) return null
            return mode === 'kg'
                ? point.topSetKg
                : round1((point.topSetKg / first.topSetKg - 1) * 100)
        }),
    }))
}

// The latest top set and how far it moved from the first one in the range.
export const exerciseSummary = (exercise: TopExerciseDTO): ExerciseSummary | null => {
    const first = exercise.points[0]
    const last = exercise.points.at(-1)
    if (first === undefined || last === undefined) return null
    const moved = exercise.points.length > 1
    return {
        latestKg: last.topSetKg,
        changeKg: moved ? last.topSetKg - first.topSetKg : null,
        changePct: moved ? round1((last.topSetKg / first.topSetKg - 1) * 100) : null,
    }
}
