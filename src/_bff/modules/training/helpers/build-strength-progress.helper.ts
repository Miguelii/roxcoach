import type { ProgressRange } from '@/_bff/core/constants/progress.constants'
import { ONE_RM_MAX_REPS, TOP_EXERCISES } from '@/_bff/core/constants/progress.constants'
import type {
    BodyWeightPointDTO,
    ExercisePointDTO,
    StrengthProgressDTO,
    TopExerciseDTO,
} from '@/_bff/modules/training/types/progress'

type WorkoutRow = { activityId: string; localDate: string; bodyWeightKg: number | null }

type SetRow = {
    activityId: string
    exercise: string
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
    workouts: Set<string>
    totalSets: number
    points: Map<string, ExercisePointDTO>
}

const maxOrNull = (a: number | null, b: number | null) =>
    a === null ? b : b === null ? a : Math.max(a, b)

const round1 = (n: number) => Math.round(n * 10) / 10

function buildBodyWeight(workouts: WorkoutRow[]): BodyWeightPointDTO[] {
    const byDate = new Map<string, number>()
    for (const w of workouts) {
        if (w.bodyWeightKg !== null && w.bodyWeightKg > 0) byDate.set(w.localDate, w.bodyWeightKg)
    }
    return [...byDate]
        .map(([date, kg]) => ({ date, kg }))
        .sort((a, b) => a.date.localeCompare(b.date))
}

function metricsOf(set: SetRow): Pick<ExercisePointDTO, 'topSetKg' | 'estimatedOneRmKg'> {
    const { reps, loadKg } = set
    if (reps === null || loadKg === null || reps < 1 || loadKg <= 0) {
        return { topSetKg: null, estimatedOneRmKg: null }
    }
    return {
        topSetKg: loadKg,
        estimatedOneRmKg: reps <= ONE_RM_MAX_REPS ? round1(loadKg * (1 + reps / 30)) : null,
    }
}

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
            workouts: new Set<string>(),
            totalSets: 0,
            points: new Map<string, ExercisePointDTO>(),
        }
        if (date >= acc.nameDate) {
            acc.name = set.exercise
            acc.nameDate = date
        }
        acc.workouts.add(set.activityId)
        acc.totalSets += 1
        const metrics = metricsOf(set)
        const existing = acc.points.get(date)
        acc.points.set(date, {
            date,
            topSetKg: maxOrNull(existing?.topSetKg ?? null, metrics.topSetKg),
            estimatedOneRmKg: maxOrNull(
                existing?.estimatedOneRmKg ?? null,
                metrics.estimatedOneRmKg
            ),
        })
        exercises.set(key, acc)
    }

    const ranked = [...exercises]
        .filter(([, acc]) => [...acc.points.values()].some((p) => p.topSetKg !== null))
        .toSorted(
            ([, a], [, b]) =>
                b.workouts.size - a.workouts.size ||
                b.totalSets - a.totalSets ||
                a.name.localeCompare(b.name)
        )
        .slice(0, TOP_EXERCISES)

    const top: TopExerciseDTO[] = ranked.map(([key, acc]) => ({
        key,
        name: acc.name,
        workouts: acc.workouts.size,
        points: [...acc.points.values()].toSorted((a, b) => a.date.localeCompare(b.date)),
    }))

    return { range, exercises: top, bodyWeight: buildBodyWeight(workouts) }
}
