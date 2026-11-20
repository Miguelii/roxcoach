import { XMLParser } from 'fast-xml-parser'
import { Effect } from 'effect'
import { z } from 'zod'
import { ActivityFileParseError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { ParsedActivity, ParsedLap } from '@/_bff/modules/training/types'

type Maybe<T> = T | undefined

const ARRAY_TAGS = new Set(['Activity', 'Lap', 'Trackpoint', 'trkpt', 'trkseg', 'trk'])

// parseTagValue is off, so every leaf is a string.
const leaf = z.string().optional()
const hrSchema = z.object({ Value: leaf }).optional().catch(undefined)
const lapSchema = z.object({
    '@_StartTime': leaf,
    TotalTimeSeconds: leaf,
    DistanceMeters: leaf,
    Calories: leaf,
    AverageHeartRateBpm: hrSchema,
    MaximumHeartRateBpm: hrSchema,
})
const tcxSchema = z.object({
    TrainingCenterDatabase: z.object({
        Activities: z.object({
            Activity: z.array(
                z.object({
                    '@_Sport': leaf,
                    Notes: leaf,
                    Lap: z.array(lapSchema).default([]),
                })
            ),
        }),
    }),
})
type TcxLap = z.infer<typeof lapSchema>

// XML is untrusted input: entity processing is off (no expansion bombs) and namespace prefixes are stripped.
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    processEntities: false,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) => ARRAY_TAGS.has(name),
})

export function parseXml(bytes: Uint8Array) {
    const text = new TextDecoder().decode(bytes)
    if (/<!ENTITY/i.test(text)) throw new Error('entity declaration')
    // SAFETY: the tree is validated by a zod schema by every caller before use.
    return parser.parse(text) as Record<string, never>
}

export const numOf = (v: Maybe<string>): number | null => {
    if (v === undefined || v.trim() === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}
export const isoOf = (v: Maybe<string>): string | null => {
    if (v === undefined) return null
    const ms = Date.parse(v)
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}
const textOf = (v: Maybe<string>): string | null => (v && v.trim() !== '' ? v.trim() : null)
const sum = (values: (number | null)[]): number | null => {
    const present = values.filter((v): v is number => v !== null)
    return present.length ? present.reduce((a, b) => a + b, 0) : null
}
const hrValue = (v: Maybe<{ Value?: Maybe<string> }>): number | null => numOf(v?.Value)

function parseLap(lap: TcxLap, index: number): ParsedLap | null {
    const startedAt = isoOf(lap['@_StartTime'])
    if (!startedAt) return null
    const elapsed = numOf(lap.TotalTimeSeconds)
    const distance = numOf(lap.DistanceMeters)
    const avg = hrValue(lap.AverageHeartRateBpm)
    const calories = numOf(lap.Calories)
    return {
        lapIndex: index,
        name: null,
        startedAt,
        elapsedTimeS: elapsed === null ? null : Math.round(elapsed),
        movingTimeS: null,
        distanceM: distance,
        avgHr: avg === null ? null : Math.round(avg),
        avgSpeedMps: elapsed && distance !== null ? distance / elapsed : null,
        calories: calories === null ? null : Math.round(calories),
    }
}

function build(root: Record<string, never>): ParsedActivity | null {
    const node = tcxSchema.parse(root).TrainingCenterDatabase.Activities.Activity[0]
    if (!node) return null
    const lapNodes = node.Lap
    const laps = lapNodes.flatMap((l, i) => parseLap(l, i) ?? [])
    const first = laps[0]
    if (!first) return null
    const sport = textOf(node['@_Sport'])
    const note = textOf(node.Notes)
    const elapsed = sum(laps.map((l) => l.elapsedTimeS))
    const distance = sum(laps.map((l) => l.distanceM))
    const hrs = lapNodes.flatMap((l) => hrValue(l.AverageHeartRateBpm) ?? [])
    const maxes = lapNodes.flatMap((l) => hrValue(l.MaximumHeartRateBpm) ?? [])
    return {
        format: 'tcx',
        startedAt: first.startedAt,
        sportType: sport,
        category: sport === 'Running' ? 'run' : 'other',
        name: note ?? sport ?? 'Activity',
        distanceM: distance,
        movingTimeS: null,
        elapsedTimeS: elapsed,
        elevationGainM: null,
        avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
        maxHr: maxes.length ? Math.round(Math.max(...maxes)) : null,
        avgSpeedMps: elapsed && distance !== null ? distance / elapsed : null,
        calories: sum(laps.map((l) => l.calories)),
        noteText: note,
        laps,
    }
}

export function parseTcx(bytes: Uint8Array) {
    return Effect.try({
        try: () => {
            const activity = build(parseXml(bytes))
            if (!activity) throw new Error('empty tcx')
            return activity
        },
        catch: (cause) =>
            new ActivityFileParseError({
                cause: cause instanceof Error ? cause.name : 'unknown',
                error_hash: ErrorCode.TRAINING_FILE_PARSE,
            }),
    })
}
