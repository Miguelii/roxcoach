import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import type { HyroxStation } from '@/_bff/core/constants/hyrox.constants'

type ActivityCategory = 'run' | 'hyrox' | 'strength' | 'cross' | 'other'

export type LapRow = {
    lap_index: number
    name: string | null
    distance_m: number
    elapsed_time_s: number
    moving_time_s: number
    avg_hr: number | null
    avg_speed_mps: number | null
    station: HyroxStation | null
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
