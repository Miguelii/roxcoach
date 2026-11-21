import { exerciseKeyOf, summarizeExercise } from '@/_bff/core/helpers/strength-detail.helper'
import type { ExerciseComparisonDTO } from '@/_bff/modules/training/types'

type Row = {
    exercise: string
    sourceExerciseId: string | null
    reps: number | null
    loadKg: number | null
}

type CurrentSet = Pick<Row, 'exercise' | 'sourceExerciseId'>

type HistoryWorkout = { activityId: string; localDate: string }

type HistorySet = Row & { activityId: string }

type Input = {
    current: CurrentSet[]
    // Earlier workouts, most recent first.
    history: HistoryWorkout[]
    sets: HistorySet[]
}

// For every exercise of the current workout: its most recent earlier session and the best top set,
// estimated 1RM and single-workout volume ever done. Exercises are matched by `exerciseKeyOf`, so a renamed Lyfta exercise still matches.
export function buildStrengthComparison({
    current,
    history,
    sets,
}: Input): ExerciseComparisonDTO[] {
    const keys = [...new Set(current.map((set) => exerciseKeyOf(set)))]
    const byWorkout = new Map<string, Map<string, HistorySet[]>>()

    for (const set of sets) {
        const perKey = byWorkout.get(set.activityId) ?? new Map<string, HistorySet[]>()
        const key = exerciseKeyOf(set)
        perKey.set(key, [...(perKey.get(key) ?? []), set])
        byWorkout.set(set.activityId, perKey)
    }

    return keys.map((key) => {
        let previous: ExerciseComparisonDTO['previous'] = null
        let bestPriorTopSetKg: number | null = null
        let bestPriorE1rmKg: number | null = null
        let bestPriorVolumeKg: number | null = null

        for (const workout of history) {
            const rows = byWorkout.get(workout.activityId)?.get(key)
            if (rows === undefined) continue

            const summary = summarizeExercise(rows)
            if (previous === null) {
                previous = {
                    localDate: workout.localDate,
                    topSetKg: summary.topSetKg,
                    topSetReps: summary.topSetReps,
                    volumeKg: summary.volumeKg,
                }
            }
            if (
                summary.topSetKg !== null &&
                (bestPriorTopSetKg === null || summary.topSetKg > bestPriorTopSetKg)
            ) {
                bestPriorTopSetKg = summary.topSetKg
            }
            if (
                summary.e1rmKg !== null &&
                (bestPriorE1rmKg === null || summary.e1rmKg > bestPriorE1rmKg)
            ) {
                bestPriorE1rmKg = summary.e1rmKg
            }
            if (
                summary.volumeKg > 0 &&
                (bestPriorVolumeKg === null || summary.volumeKg > bestPriorVolumeKg)
            ) {
                bestPriorVolumeKg = summary.volumeKg
            }
        }

        return { key, previous, bestPriorTopSetKg, bestPriorE1rmKg, bestPriorVolumeKg }
    })
}
