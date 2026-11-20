import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import type { HyroxStation } from '@/_bff/core/constants/hyrox.constants'
import type { RaceDTO } from '@/_bff/modules/races/types'

export type ActivityCategory = 'run' | 'hyrox' | 'strength' | 'cross' | 'other'
type ActivitySource = 'strava' | 'manual' | 'lyfta'

export type LyftaActivityRow = {
    source_id: string
    category: 'strength'
    sport_type: 'strength'
    name: string
    started_at: string
    local_date: string
    elapsed_time_s: number | null
    body_weight_kg: number | null
    lyfta_total_volume_kg_reps: number | null
}

export type NewStrengthSetRow = {
    exercise: string
    exercise_index: number
    source_exercise_id?: string | null
    set_index: number
    reps: number | null
    load_kg: number | null
    rir?: number | null
    rpe: null
}

export type StrengthSetDTO = {
    exercise: string
    exerciseIndex: number | null
    sourceExerciseId: string | null
    setIndex: number
    reps: number | null
    loadKg: number | null
    rir: number | null
    rpe: number | null
}

export type LapRow = {
    lap_index: number
    name: string | null
    distance_m: number | null
    elapsed_time_s: number | null
    moving_time_s: number | null
    avg_hr: number | null
    avg_speed_mps: number | null
    station: HyroxStation | null
}

export type ActivityFormat = 'fit' | 'tcx' | 'gpx'

export type ParsedLap = {
    lapIndex: number
    name: string | null
    startedAt: string
    elapsedTimeS: number | null
    movingTimeS: number | null
    distanceM: number | null
    avgHr: number | null
    avgSpeedMps: number | null
    calories: number | null
}

export type ParsedActivity = {
    format: ActivityFormat
    startedAt: string
    sportType: string | null
    category: ActivityCategory
    name: string
    distanceM: number | null
    movingTimeS: number | null
    elapsedTimeS: number | null
    elevationGainM: number | null
    avgHr: number | null
    maxHr: number | null
    avgSpeedMps: number | null
    calories: number | null
    // TCX Notes, used for Hyrox hinting
    noteText: string | null
    laps: ParsedLap[]
}

// The service-role client (server-side admin work) or the signed-in user's client (queries).
export type TrainingClient =
    | ReturnType<typeof createDBAdminClient>
    | Awaited<ReturnType<typeof createDBServerClient>>

// Insert shape of a manually uploaded activity (source is always 'manual').
export type NewActivityRow = {
    sport_type: string | null
    category: ActivityCategory
    name: string
    started_at: string
    local_date: string
    distance_m: number | null
    moving_time_s: number | null
    elapsed_time_s: number | null
    elevation_gain_m: number | null
    avg_hr: number | null
    max_hr: number | null
    avg_speed_mps: number | null
    calories: number | null
}

export type NewActivityFileRow = {
    id: string
    activity_id: string
    format: ActivityFormat
    storage_path: string
    sha256: string
    size_bytes: number
    original_name: string
    status: 'parsed' | 'failed'
    error_code: string | null
}

// The part of the Supabase client the storage repository touches.
export type StorageClient = {
    storage: {
        from(bucket: string): {
            upload(
                path: string,
                body: Uint8Array,
                options: { contentType: string; upsert: boolean }
            ): PromiseLike<{ error: { message: string } | null }>
            remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>
        }
    }
}

export type ActivityDTO = {
    id: string
    source: ActivitySource
    category: ActivityCategory
    name: string
    startedAt: string
    localDate: string
    distanceM: number | null
    movingTimeS: number | null
    elapsedTimeS: number | null
    elevationGainM: number | null
    avgHr: number | null
    maxHr: number | null
    avgSpeedMps: number | null
    calories: number | null
    bodyWeightKg: number | null
    lyftaTotalVolumeKgReps: number | null
    perceivedEffort: number | null
    notes: string | null
}

export type LapDTO = {
    lapIndex: number
    name: string | null
    distanceM: number | null
    elapsedTimeS: number | null
    movingTimeS: number | null
    avgHr: number | null
    avgSpeedMps: number | null
    station: HyroxStation | null
}

export type RaceSummaryDTO = Pick<
    RaceDTO,
    'id' | 'name' | 'raceType' | 'raceDate' | 'targetTimeS' | 'priority' | 'status'
>

export type CalendarItem =
    | { type: 'activity'; date: string; activity: ActivityDTO }
    | { type: 'race'; date: string; race: RaceSummaryDTO }
