import { z } from 'zod'

// Strava sends `null` for some optional metrics and omits others, so both are accepted.
export const stravaActivitySchema = z.object({
    id: z.number(),
    name: z.string(),
    sport_type: z.string(),
    start_date: z.iso.datetime(),
    distance: z.number().nullish(),
    moving_time: z.number().nullish(),
    elapsed_time: z.number().nullish(),
    total_elevation_gain: z.number().nullish(),
    average_heartrate: z.number().nullish(),
    max_heartrate: z.number().nullish(),
    average_speed: z.number().nullish(),
    calories: z.number().nullish(),
})

export const stravaLapSchema = z.object({
    lap_index: z.number(),
    name: z.string().nullish(),
    distance: z.number(),
    elapsed_time: z.number(),
    moving_time: z.number(),
    average_heartrate: z.number().nullish(),
    average_speed: z.number().nullish(),
})

export type StravaActivity = z.infer<typeof stravaActivitySchema>
export type StravaLap = z.infer<typeof stravaLapSchema>
