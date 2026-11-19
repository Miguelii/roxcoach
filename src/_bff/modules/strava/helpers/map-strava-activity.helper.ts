import type { HyroxStation } from '@/_bff/core/constants/hyrox.constants'
import type { StravaActivity, StravaLap } from '@/_bff/modules/strava/helpers/strava-schemas.helper'

export type ActivityCategory = 'run' | 'hyrox' | 'strength' | 'cross' | 'other'

export type ActivityRow = {
    strava_id: number
    source: 'strava'
    category: ActivityCategory
    sport_type: string
    name: string
    started_at: string
    local_date: string
    distance_m: number
    moving_time_s: number
    elapsed_time_s: number
    elevation_gain_m: number
    avg_hr: number | null
    max_hr: number | null
    avg_speed_mps: number | null
    calories: number | null
}

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

const FIXED_CATEGORIES = new Map<string, ActivityCategory>([
    ['Run', 'run'],
    ['TrailRun', 'run'],
    ['VirtualRun', 'run'],
    ['WeightTraining', 'strength'],
    ['Crossfit', 'strength'],
    ['Rowing', 'cross'],
    ['Ride', 'cross'],
    ['Swim', 'cross'],
    ['Walk', 'cross'],
    ['Hike', 'cross'],
    ['Elliptical', 'cross'],
])

// Sport types that become a Hyrox session only when station laps were detected.
const HYROX_CANDIDATE_SPORT_TYPES = new Set(['Workout', 'HighIntensityIntervalTraining'])

export const mapStravaCategory = (sportType: string, hasStations: boolean): ActivityCategory => {
    if (HYROX_CANDIDATE_SPORT_TYPES.has(sportType)) return hasStations ? 'hyrox' : 'cross'
    return FIXED_CATEGORIES.get(sportType) ?? 'other'
}

// The calendar day of the instant in the athlete's timezone, as YYYY-MM-DD (en-CA order).
const toLocalDate = (isoInstant: string, timezone: string): string =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(isoInstant))

// The category assumes no stations: the sync service recomputes it after station detection.
export const mapStravaActivity = (activity: StravaActivity, timezone: string): ActivityRow => ({
    strava_id: activity.id,
    source: 'strava',
    category: mapStravaCategory(activity.sport_type, false),
    sport_type: activity.sport_type,
    name: activity.name,
    started_at: new Date(activity.start_date).toISOString(),
    local_date: toLocalDate(activity.start_date, timezone),
    distance_m: activity.distance,
    moving_time_s: activity.moving_time,
    elapsed_time_s: activity.elapsed_time,
    elevation_gain_m: activity.total_elevation_gain,
    avg_hr: activity.average_heartrate ?? null,
    max_hr: activity.max_heartrate ?? null,
    avg_speed_mps: activity.average_speed ?? null,
    calories: activity.calories ?? null,
})

export const mapStravaLaps = (laps: StravaLap[], stations: Array<HyroxStation | null>): LapRow[] =>
    laps.map((lap, index) => ({
        lap_index: lap.lap_index,
        name: lap.name ?? null,
        distance_m: lap.distance,
        elapsed_time_s: lap.elapsed_time,
        moving_time_s: lap.moving_time,
        avg_hr: lap.average_heartrate ?? null,
        avg_speed_mps: lap.average_speed ?? null,
        station: stations[index] ?? null,
    }))
