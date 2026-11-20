import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import type { HyroxStation } from '@/_bff/core/constants/hyrox.constants'

export type ActivityCategory = 'run' | 'hyrox' | 'strength' | 'cross' | 'other'

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

// The service-role client (sync jobs, webhook) or the signed-in user's client (queries).
export type TrainingClient =
    | ReturnType<typeof createDBAdminClient>
    | Awaited<ReturnType<typeof createDBServerClient>>

export type ActivityDTO = {
    id: string
    source: 'strava' | 'manual'
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

export type CalendarItem = { type: 'activity'; date: string; activity: ActivityDTO }
