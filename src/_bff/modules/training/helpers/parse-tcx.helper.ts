import { Effect } from 'effect'
import { z } from 'zod'
import { ActivityFileParseError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { isoOf, numOf, parseXml, type XmlTree } from '@/_bff/modules/training/helpers/xml.helper'
import type { ParsedActivity, ParsedLap } from '@/_bff/modules/training/types'

type Maybe<T> = T | undefined
type LapWithMax = { lap: ParsedLap; maxHr: number | null }

// parseTagValue is off, so every leaf is a string.
const leaf = z.string().optional()
const hrSchema = z.object({ Value: leaf }).optional().catch(undefined)
const lapSchema = z.object({
    '@_StartTime': leaf,
    TotalTimeSeconds: leaf,
    DistanceMeters: leaf,
    Calories: leaf,
    Track: z
        .array(z.object({ Trackpoint: z.array(z.object({ Time: leaf })).default([]) }))
        .catch([]),
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

const textOf = (v: Maybe<string>): string | null => (v && v.trim() !== '' ? v.trim() : null)
const sum = (values: (number | null)[]): number | null => {
    const present = values.filter((v): v is number => v !== null)
    return present.length ? present.reduce((a, b) => a + b, 0) : null
}
const hrValue = (v: Maybe<{ Value?: Maybe<string> }>): number | null => numOf(v?.Value)

// The lap start falls back to the first trackpoint time when StartTime is missing.
function parseLap(lap: TcxLap, index: number): LapWithMax | null {
    const firstPoint = lap.Track.flatMap((t) => t.Trackpoint.flatMap((p) => isoOf(p.Time) ?? []))[0]
    const startedAt = isoOf(lap['@_StartTime']) ?? firstPoint
    if (!startedAt) return null
    const elapsed = numOf(lap.TotalTimeSeconds)
    const distance = numOf(lap.DistanceMeters)
    const avg = hrValue(lap.AverageHeartRateBpm)
    const max = hrValue(lap.MaximumHeartRateBpm)
    const calories = numOf(lap.Calories)
    return {
        maxHr: max,
        lap: {
            lapIndex: index,
            name: null,
            startedAt,
            elapsedTimeS: elapsed === null ? null : Math.round(elapsed),
            movingTimeS: null,
            distanceM: distance,
            avgHr: avg === null ? null : Math.round(avg),
            avgSpeedMps: elapsed && distance !== null ? distance / elapsed : null,
            calories: calories === null ? null : Math.round(calories),
        },
    }
}

// Mean of the lap averages weighted by lap duration (plain mean when a duration is missing).
function weightedAvgHr(laps: ParsedLap[]): number | null {
    const withHr = laps.filter((l) => l.avgHr !== null)
    if (!withHr.length) return null
    const weighted = withHr.every((l) => (l.elapsedTimeS ?? 0) > 0)
    const weights = withHr.map((l) => (weighted ? (l.elapsedTimeS ?? 0) : 1))
    const total = weights.reduce((a, b) => a + b, 0)
    const acc = withHr.reduce((a, l, i) => a + (l.avgHr ?? 0) * (weights[i] ?? 0), 0)
    return Math.round(acc / total)
}

function build(root: XmlTree): ParsedActivity | null {
    const node = tcxSchema.parse(root).TrainingCenterDatabase.Activities.Activity[0]
    if (!node) return null
    const parsed = node.Lap.flatMap((l, i) => parseLap(l, i) ?? [])
    const laps = parsed.map((p) => p.lap)
    const first = laps[0]
    if (!first) return null
    const sport = textOf(node['@_Sport'])
    const note = textOf(node.Notes)
    const elapsed = sum(laps.map((l) => l.elapsedTimeS))
    const distance = sum(laps.map((l) => l.distanceM))
    const maxes = parsed.flatMap((p) => p.maxHr ?? [])
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
        avgHr: weightedAvgHr(laps),
        maxHr: maxes.length ? Math.round(maxes.reduce((a, b) => Math.max(a, b), -Infinity)) : null,
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
