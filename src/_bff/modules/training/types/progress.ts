import type { HrZoneBounds, ZoneNumber } from '@/_bff/core/constants/hr-zones.constants'
import type { ProgressRange } from '@/_bff/core/constants/progress.constants'

export type RunZonePointDTO = { zone: ZoneNumber; paceSecPerKm: number | null; minutes: number }

export type RunBucketDTO = {
    start: string
    paceSecPerKm: number | null
    distanceKm: number
    movingTimeS: number
    runs: number
    // Average heart rate of the runs in the bucket, weighted by moving time.
    avgHrBpm: number | null
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
    readiness: RunReadinessDTO | null
    kpis: {
        avgPaceSecPerKm: number | null
        distanceKm: number
        runs: number
        recentPaceSecPerKm: number | null
        // Positive means slower than the goal.
        goalDeltaSecPerKm: number | null
    }
}

// The heaviest set of one workout date, with its reps (more reps wins a tie on load).
type ExercisePointDTO = { date: string; topSetKg: number; topSetReps: number }

export type TopExerciseDTO = {
    key: string
    name: string
    // The exercise picture from the workout source, when it has one.
    imageUrl: string | null
    workouts: number
    points: ExercisePointDTO[]
}

export type StrengthBucketDTO = {
    start: string
    // Sum of reps times load over every set of the bucket.
    volumeKg: number
    workouts: number
    sets: number
}

export type StrengthProgressDTO = {
    range: ProgressRange
    granularity: 'week' | 'month'
    buckets: StrengthBucketDTO[]
    exercises: TopExerciseDTO[]
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

// [paceSPerKm, timeS, distanceM]: moving time and distance at a pace, in 5 s/km bins
export type PaceBin = [paceSPerKm: number, timeS: number, distanceM: number]

export type PaceHistogram = { v: 1; bins: PaceBin[] }

export type ReadinessState = 'on_track' | 'attention' | 'no_data' | 'taper'

export type RunReadinessDTO = {
    race: {
        raceId: string
        name: string
        raceType: string
        raceDate: string
        daysLeft: number
        targetTimeS: number
        priority: string
        racePaceSPerKm: number
    }
    load: {
        state: ReadinessState
        weeklyKm: number
        previousWeeklyKm: number | null
        ratio: number | null
        easySharePct: number | null
    }
    pace: {
        state: ReadinessState
        fastSessions: number
        hardLast7Days: number
        backToBack: boolean
        fastTimeS: number
    }
}
