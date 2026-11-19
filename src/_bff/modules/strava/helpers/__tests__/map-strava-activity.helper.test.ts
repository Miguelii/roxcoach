import { describe, expect, it } from 'vitest'
import type { HyroxStation } from '@/_bff/core/constants/hyrox.constants'
import {
    mapStravaActivity,
    mapStravaCategory,
    mapStravaLaps,
    type ActivityCategory,
    type ActivityRow,
    type LapRow,
} from '@/_bff/modules/strava/helpers/map-strava-activity.helper'
import {
    stravaActivitySchema,
    stravaLapSchema,
    type StravaActivity,
    type StravaLap,
} from '@/_bff/modules/strava/helpers/strava-schemas.helper'

const fullActivity: StravaActivity = {
    id: 123456789,
    name: 'Morning tempo',
    sport_type: 'Run',
    start_date: '2026-06-14T07:15:00Z',
    distance: 10250.5,
    moving_time: 3010,
    elapsed_time: 3100,
    total_elevation_gain: 84.2,
    average_heartrate: 158.4,
    max_heartrate: 181,
    average_speed: 3.405,
    calories: 702,
}

const minimalActivity: StravaActivity = {
    id: 42,
    name: 'Lunch lift',
    sport_type: 'WeightTraining',
    start_date: '2026-06-14T12:00:00Z',
    distance: 0,
    moving_time: 2400,
    elapsed_time: 3000,
    total_elevation_gain: 0,
}

const withStart = (start_date: string): StravaActivity => ({ ...fullActivity, start_date })

describe('mapStravaCategory', () => {
    const cases: Array<[string, boolean, ActivityCategory]> = [
        ['Run', false, 'run'],
        ['TrailRun', false, 'run'],
        ['VirtualRun', false, 'run'],
        ['Run', true, 'run'],
        ['WeightTraining', false, 'strength'],
        ['Crossfit', false, 'strength'],
        ['Workout', true, 'hyrox'],
        ['Workout', false, 'cross'],
        ['HighIntensityIntervalTraining', true, 'hyrox'],
        ['HighIntensityIntervalTraining', false, 'cross'],
        ['Rowing', false, 'cross'],
        ['Ride', false, 'cross'],
        ['Swim', false, 'cross'],
        ['Walk', false, 'cross'],
        ['Hike', false, 'cross'],
        ['Elliptical', false, 'cross'],
        ['Yoga', false, 'other'],
        ['SomethingNew', true, 'other'],
        ['', false, 'other'],
    ]

    it.each(cases)('maps %s (hasStations %s) to %s', (sportType, hasStations, expected) => {
        expect(mapStravaCategory(sportType, hasStations)).toBe(expected)
    })
})

describe('mapStravaActivity', () => {
    it('maps every column from a full activity', () => {
        const expected: ActivityRow = {
            strava_id: 123456789,
            source: 'strava',
            category: 'run',
            sport_type: 'Run',
            name: 'Morning tempo',
            started_at: '2026-06-14T07:15:00.000Z',
            local_date: '2026-06-14',
            distance_m: 10250.5,
            moving_time_s: 3010,
            elapsed_time_s: 3100,
            elevation_gain_m: 84.2,
            avg_hr: 158.4,
            max_hr: 181,
            avg_speed_mps: 3.405,
            calories: 702,
        }

        expect(mapStravaActivity(fullActivity, 'Europe/Lisbon')).toEqual(expected)
    })

    it('stores missing optional values as null, never 0 or a placeholder', () => {
        const row = mapStravaActivity(minimalActivity, 'Europe/Lisbon')

        expect(row.avg_hr).toBeNull()
        expect(row.max_hr).toBeNull()
        expect(row.avg_speed_mps).toBeNull()
        expect(row.calories).toBeNull()
        expect(row.category).toBe('strength')
    })

    it('treats explicit nulls from Strava like missing values', () => {
        const parsed = stravaActivitySchema.parse({
            ...minimalActivity,
            average_heartrate: null,
            max_heartrate: null,
            average_speed: null,
            calories: null,
        })

        const row = mapStravaActivity(parsed, 'Europe/Lisbon')

        expect(row.avg_hr).toBeNull()
        expect(row.max_hr).toBeNull()
        expect(row.avg_speed_mps).toBeNull()
        expect(row.calories).toBeNull()
    })

    it('computes the category with no stations (the sync recomputes it after detection)', () => {
        const row = mapStravaActivity({ ...fullActivity, sport_type: 'Workout' }, 'Europe/Lisbon')

        expect(row.category).toBe('cross')
        expect(row.sport_type).toBe('Workout')
    })

    it('uses the next local day in summer Lisbon (UTC+1) near midnight', () => {
        const row = mapStravaActivity(withStart('2026-06-30T23:30:00Z'), 'Europe/Lisbon')

        expect(row.local_date).toBe('2026-07-01')
        expect(row.started_at).toBe('2026-06-30T23:30:00.000Z')
    })

    it('keeps the same local day in winter Lisbon (UTC+0) near midnight', () => {
        const row = mapStravaActivity(withStart('2026-12-31T23:30:00Z'), 'Europe/Lisbon')

        expect(row.local_date).toBe('2026-12-31')
    })

    it('uses the previous local day for a negative-offset timezone', () => {
        const row = mapStravaActivity(withStart('2026-07-01T01:30:00Z'), 'America/Sao_Paulo')

        expect(row.local_date).toBe('2026-06-30')
    })
})

describe('mapStravaLaps', () => {
    const laps: StravaLap[] = [
        {
            lap_index: 1,
            name: 'Lap 1',
            distance: 1000,
            elapsed_time: 270,
            moving_time: 268,
            average_heartrate: 165.5,
            average_speed: 3.7,
        },
        { lap_index: 2, distance: 90.5, elapsed_time: 240, moving_time: 235 },
    ]

    it('maps lap columns and carries the station tags through', () => {
        const stations: Array<HyroxStation | null> = [null, 'ski_erg']
        const expected: LapRow[] = [
            {
                lap_index: 1,
                name: 'Lap 1',
                distance_m: 1000,
                elapsed_time_s: 270,
                moving_time_s: 268,
                avg_hr: 165.5,
                avg_speed_mps: 3.7,
                station: null,
            },
            {
                lap_index: 2,
                name: null,
                distance_m: 90.5,
                elapsed_time_s: 240,
                moving_time_s: 235,
                avg_hr: null,
                avg_speed_mps: null,
                station: 'ski_erg',
            },
        ]

        expect(mapStravaLaps(laps, stations)).toEqual(expected)
    })

    it('uses null for a lap with no matching station entry', () => {
        expect(mapStravaLaps(laps, []).map((lap) => lap.station)).toEqual([null, null])
    })

    it('parses a raw Strava lap payload with the schema', () => {
        const parsed = stravaLapSchema.parse({
            id: 9,
            lap_index: 1,
            name: 'Lap 1',
            distance: 1000,
            elapsed_time: 270,
            moving_time: 268,
            average_speed: 3.7,
            average_heartrate: null,
        })

        expect(parsed.average_heartrate).toBeNull()
        expect(mapStravaLaps([parsed], [null])[0]?.avg_hr).toBeNull()
    })
})
