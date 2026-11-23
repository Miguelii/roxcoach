import type { LyftaSyncResult } from '@/_bff/core/constants/lyfta.constants'
import type { SyncState, SyncStateRow } from '@/_bff/core/helpers/sync-state.helper'

export type LyftaConnectionRecord = {
    encryptedApiKey: string
    lastSyncedAt: string | null
    sync: SyncStateRow
}

export type LyftaConnectionStatus = {
    connected: boolean
    lastSyncedAt: string | null
    sync: SyncState<LyftaSyncResult>
}

// A record Lyfta flagged on a set. `type` 1 is the estimated 1RM and 3 the volume of the set (see
// lyfta.md); `level` and `value` are Lyfta's own and can be missing.
export type LyftaSetRecord = {
    type: number
    level: number | null
    value: number | null
}

export type LyftaCompletedSet = {
    setIndex: number
    reps: number | null
    loadKg: number | null
    rir: number | null
    records?: LyftaSetRecord[]
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
