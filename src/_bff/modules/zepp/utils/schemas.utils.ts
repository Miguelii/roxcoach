import { z } from 'zod'
import type { ZeppHistory, ZeppJson, ZeppRunDetail } from '@/_bff/modules/zepp/types'

// Zepp sends numbers as strings or numbers depending on the field.
const num = z.coerce.number()

// Zero or below means "no value" in the history (a heart rate of 0, no calories).
const positiveOrNull = (value: number) => (value > 0 ? value : null)

const summarySchema = z
    .object({
        trackid: z.coerce.string(),
        source: z.string(),
        type: num,
        dis: num,
        run_time: num,
        end_time: num,
        avg_heart_rate: num.optional(),
        max_heart_rate: num.optional(),
        calorie: num.optional(),
        sport_title: z.string().optional(),
    })
    .transform((raw) => ({
        trackId: raw.trackid,
        source: raw.source,
        sportType: raw.type,
        distanceM: raw.dis,
        movingTimeS: raw.run_time,
        endTimeS: raw.end_time,
        avgHrBpm: positiveOrNull(raw.avg_heart_rate ?? 0),
        maxHrBpm: positiveOrNull(raw.max_heart_rate ?? 0),
        calories: positiveOrNull(raw.calorie ?? 0),
        sportTitle: raw.sport_title?.trim() || null,
    }))

const historySchema = z.object({
    data: z.object({ next: num, summary: z.array(summarySchema) }),
})

const detailSchema = z.object({
    data: z.object({
        trackid: z.coerce.string(),
        heart_rate: z.string().optional(),
        currentDistance: z.string().optional(),
        speed: z.string().optional(),
        kilo_pace: z.string().optional(),
    }),
})

export function parseZeppHistory(json: ZeppJson): ZeppHistory {
    const { data } = historySchema.parse(json)
    return { summaries: data.summary, next: data.next }
}

export function parseZeppDetail(json: ZeppJson): ZeppRunDetail {
    const { data } = detailSchema.parse(json)
    return {
        trackId: data.trackid,
        heartRate: data.heart_rate ?? '',
        distance: data.currentDistance ?? '',
        speed: data.speed ?? '',
        kiloPace: data.kilo_pace ?? '',
    }
}
