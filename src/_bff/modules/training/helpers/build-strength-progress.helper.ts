import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { TOP_EXERCISES } from '@/_bff/core/constants/progress.constants'
import type { StrengthProgressDTO, TopExerciseDTO } from '@/_bff/modules/training/types/progress'

type WorkoutRow = { activityId: string; localDate: string }

type SetRow = {
    activityId: string
    exercise: string
    exerciseImageUrl: string | null
    sourceExerciseId: string | null
    reps: number | null
    loadKg: number | null
}

type Input = {
    range: ProgressRange
    today: string
    workouts: WorkoutRow[]
    sets: SetRow[]
}

type ExerciseAcc = {
    name: string
    nameDate: string
    imageUrl: string | null
    imageDate: string
    workouts: Set<string>
    totalSets: number
    // The heaviest set per workout date.
    topSets: Map<string, number>
}

// A set counts for the top set only with reps and a positive load (bodyweight work has no load).
const usableLoad = (set: SetRow) =>
    set.reps !== null && set.reps >= 1 && set.loadKg !== null && set.loadKg > 0 ? set.loadKg : null

// The most used exercises with the heaviest set of every workout date. `workouts` and `sets` are
// already bounded by the range and come in ascending workout order.
export function buildStrengthProgress({ range, workouts, sets }: Input): StrengthProgressDTO {
    const dateOf = new Map(workouts.map((w) => [w.activityId, w.localDate]))
    const order = new Map(workouts.map((w, index) => [w.activityId, index]))
    const exercises = new Map<string, ExerciseAcc>()

    const ordered = sets
        .filter((s) => dateOf.has(s.activityId))
        .toSorted((a, b) => (order.get(a.activityId) ?? 0) - (order.get(b.activityId) ?? 0))

    for (const set of ordered) {
        const date = dateOf.get(set.activityId)
        if (date === undefined) continue
        const key = set.sourceExerciseId ?? set.exercise.trim().toLowerCase()
        const acc = exercises.get(key) ?? {
            name: set.exercise,
            nameDate: date,
            imageUrl: null,
            imageDate: '',
            workouts: new Set<string>(),
            totalSets: 0,
            topSets: new Map<string, number>(),
        }
        if (date >= acc.nameDate) {
            acc.name = set.exercise
            acc.nameDate = date
        }
        // The picture of the most recent workout that has one.
        if (set.exerciseImageUrl !== null && date >= acc.imageDate) {
            acc.imageUrl = set.exerciseImageUrl
            acc.imageDate = date
        }
        acc.workouts.add(set.activityId)
        acc.totalSets += 1
        const load = usableLoad(set)
        if (load !== null) acc.topSets.set(date, Math.max(acc.topSets.get(date) ?? 0, load))
        exercises.set(key, acc)
    }

    const top: TopExerciseDTO[] = [...exercises]
        .filter(([, acc]) => acc.topSets.size > 0)
        .toSorted(
            ([, a], [, b]) =>
                b.workouts.size - a.workouts.size ||
                b.totalSets - a.totalSets ||
                a.name.localeCompare(b.name)
        )
        .slice(0, TOP_EXERCISES)
        .map(([key, acc]) => ({
            key,
            name: acc.name,
            imageUrl: acc.imageUrl,
            workouts: acc.workouts.size,
            points: [...acc.topSets]
                .map(([date, topSetKg]) => ({ date, topSetKg }))
                .toSorted((a, b) => a.date.localeCompare(b.date)),
        }))

    return { range, exercises: top }
}
