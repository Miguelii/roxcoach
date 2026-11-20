export type LyftaConnectionRecord = {
    encryptedApiKey: string
    lastSyncedAt: string | null
}

export type LyftaConnectionStatus = {
    connected: boolean
    lastSyncedAt: string | null
}

export type LyftaCompletedSet = {
    setIndex: number
    reps: number | null
    loadKg: number | null
    rir: number | null
}

export type LyftaExercise = {
    exerciseId: string
    name: string
    imageUrl: string | null
    sets: LyftaCompletedSet[]
}

export type LyftaWorkout = {
    sourceId: string
    title: string
    startedAt: string
    durationSeconds: number | null
    bodyWeightKg: number | null
    totalVolumeKgReps: number | null
    exercises: LyftaExercise[]
}

export type LyftaWorkoutPage = {
    currentPage: number
    totalPages: number
    workouts: LyftaWorkout[]
}

export type LyftaWorkoutRange = {
    from?: string
    to?: string
}

export type ParseResult<T> = { success: true; data: T } | { success: false; issues: string[] }
