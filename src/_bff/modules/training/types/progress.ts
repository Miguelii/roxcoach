import type { HrZoneBounds, ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'

export type RunZonePointDTO = { zone: ZoneNumber; paceSecPerKm: number | null; minutes: number }

export type RunBucketDTO = {
    start: string
    paceSecPerKm: number | null
    distanceKm: number
    runs: number
    zones: RunZonePointDTO[]
}

export type RunGoalDTO = {
    raceId: string
    name: string
    raceDate: string
    daysLeft: number
    distanceM: number
    targetTimeS: number
    paceSecPerKm: number
}

export type RunProgressDTO = {
    range: ProgressRange
    granularity: 'week' | 'month'
    buckets: RunBucketDTO[]
    zoneBounds: HrZoneBounds[] | null
    hasZoneData: boolean
    goal: RunGoalDTO | null
    kpis: {
        avgPaceSecPerKm: number | null
        distanceKm: number
        runs: number
        recentPaceSecPerKm: number | null
        // Positive means slower than the goal.
        goalDeltaSecPerKm: number | null
    }
}

export type ExercisePointDTO = {
    date: string
    topSetKg: number | null
    estimatedOneRmKg: number | null
}

export type TopExerciseDTO = {
    key: string
    name: string
    workouts: number
    points: ExercisePointDTO[]
}

export type BodyWeightPointDTO = { date: string; kg: number }

export type StrengthProgressDTO = {
    range: ProgressRange
    exercises: TopExerciseDTO[]
    bodyWeight: BodyWeightPointDTO[]
}

// `t` is epoch ms, `distanceM` is cumulative distance in meters.
export type HrSample = {
    t: number
    hr: number | null
    distanceM: number | null
    speedMps: number | null
}

// [bpm, timeS, distanceM]
export type HrBin = [bpm: number, timeS: number, distanceM: number]

export type HrHistogram = { v: 1; bins: HrBin[] }
