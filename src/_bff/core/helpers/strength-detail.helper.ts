type SetInput = {
    reps: number | null
    loadKg: number | null
    rir?: number | null
}

type KeyInput = {
    exercise: string
    sourceExerciseId: string | null
}

type WorkoutSetInput = SetInput &
    KeyInput & {
        exerciseIndex?: number | null
    }

export type ExerciseSummary = {
    setCount: number
    totalReps: number
    // Reps x load over the sets that have both (bodyweight work adds no volume).
    volumeKg: number
    topSetKg: number | null
    topSetReps: number | null
    // Best estimated one-rep max over the sets of 1 to 12 reps, rounded to 0.1 kg.
    e1rmKg: number | null
    avgRir: number | null
}

export type WorkoutSummary = {
    exerciseCount: number
    setCount: number
    totalReps: number
    volumeKg: number
    heaviest: { loadKg: number; reps: number; exercise: string } | null
}

// Above this many reps the Epley estimate drifts too far to be useful.
const MAX_E1RM_REPS = 12

// The same exercise across workouts: the Lyfta exercise id, else the lowercase name.
export const exerciseKeyOf = (set: KeyInput) =>
    set.sourceExerciseId ?? set.exercise.trim().toLowerCase()

// A set counts for load work only with at least one rep and a positive load.
const isLoaded = (set: SetInput): set is { reps: number; loadKg: number } =>
    set.reps !== null && set.reps >= 1 && set.loadKg !== null && set.loadKg > 0

// Epley estimate (one rep is the load itself) for a set of 1 to 12 reps, otherwise null.
const estimateOneRepMax = (loadKg: number, reps: number) => {
    if (reps < 1 || reps > MAX_E1RM_REPS) return null
    return reps === 1 ? loadKg : loadKg * (1 + reps / 30)
}

export function summarizeExercise(sets: SetInput[]): ExerciseSummary {
    let totalReps = 0
    let volumeKg = 0
    let topSetKg: number | null = null
    let topSetReps: number | null = null
    let e1rm: number | null = null
    let rirSum = 0
    let rirCount = 0

    for (const set of sets) {
        totalReps += set.reps ?? 0
        if (set.rir != null) {
            rirSum += set.rir
            rirCount += 1
        }
        if (!isLoaded(set)) continue

        volumeKg += set.reps * set.loadKg
        const heavier = topSetKg === null || set.loadKg > topSetKg
        const moreReps = set.loadKg === topSetKg && set.reps > (topSetReps ?? 0)
        if (heavier || moreReps) {
            topSetKg = set.loadKg
            topSetReps = set.reps
        }
        const estimate = estimateOneRepMax(set.loadKg, set.reps)
        if (estimate !== null && (e1rm === null || estimate > e1rm)) e1rm = estimate
    }

    return {
        setCount: sets.length,
        totalReps,
        volumeKg,
        topSetKg,
        topSetReps,
        e1rmKg: e1rm === null ? null : Math.round(e1rm * 10) / 10,
        avgRir: rirCount === 0 ? null : rirSum / rirCount,
    }
}

export function summarizeWorkout(sets: WorkoutSetInput[]): WorkoutSummary {
    const keys = new Set<string>()
    let totalReps = 0
    let volumeKg = 0
    let heaviest: WorkoutSummary['heaviest'] = null

    for (const set of sets) {
        keys.add(exerciseKeyOf(set))
        totalReps += set.reps ?? 0
        if (!isLoaded(set)) continue
        volumeKg += set.reps * set.loadKg
        if (heaviest === null || set.loadKg > heaviest.loadKg) {
            heaviest = { loadKg: set.loadKg, reps: set.reps, exercise: set.exercise }
        }
    }

    return { exerciseCount: keys.size, setCount: sets.length, totalReps, volumeKg, heaviest }
}
