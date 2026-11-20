import { Effect } from 'effect'
import { z } from 'zod'
import { ActivityFileParseError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { isoOf, numOf, parseXml } from '@/_bff/modules/training/helpers/parse-tcx.helper'
import type { ParsedActivity } from '@/_bff/modules/training/types'

type Point = {
    lat: number | null
    lon: number | null
    ele: number | null
    time: string | null
    hr: number | null
}

const leaf = z.string().optional()
const pointSchema = z.object({
    '@_lat': leaf,
    '@_lon': leaf,
    ele: leaf,
    time: leaf,
    extensions: z
        .object({ TrackPointExtension: z.object({ hr: leaf }).optional() })
        .optional()
        .catch(undefined),
})
const gpxSchema = z.object({
    gpx: z.object({
        trk: z
            .array(
                z.object({
                    name: leaf,
                    type: leaf,
                    trkseg: z
                        .array(z.object({ trkpt: z.array(pointSchema).default([]) }))
                        .default([]),
                })
            )
            .default([]),
    }),
})
type GpxPoint = z.infer<typeof pointSchema>

const EARTH_RADIUS_M = 6371000
const rad = (d: number) => (d * Math.PI) / 180

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const dLat = rad(b.lat - a.lat)
    const dLon = rad(b.lon - a.lon)
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

function readPoint(p: GpxPoint): Point {
    return {
        lat: numOf(p['@_lat']),
        lon: numOf(p['@_lon']),
        ele: numOf(p.ele),
        time: isoOf(p.time),
        hr: numOf(p.extensions?.TrackPointExtension?.hr),
    }
}

function build(root: Record<string, never>): ParsedActivity | null {
    const trks = gpxSchema.parse(root).gpx.trk
    const points = trks.flatMap((t) => t.trkseg.flatMap((s) => s.trkpt)).map(readPoint)
    const times = points.flatMap((p) => p.time ?? [])
    const first = times[0]
    const last = times.at(-1)
    if (first === undefined || last === undefined) return null
    const elapsed = Math.round((Date.parse(last) - Date.parse(first)) / 1000)

    const positions = points.flatMap((p) =>
        p.lat !== null && p.lon !== null ? [{ lat: p.lat, lon: p.lon }] : []
    )
    const distance =
        positions.length > 1
            ? positions.slice(1).reduce((acc, p, i) => acc + haversine(positions[i]!, p), 0)
            : null
    const eles = points.flatMap((p) => p.ele ?? [])
    const gain = eles.length
        ? eles.slice(1).reduce((acc, e, i) => acc + Math.max(0, e - eles[i]!), 0)
        : null
    const hrs = points.flatMap((p) => p.hr ?? [])

    const trk = trks[0]
    const type = trk?.type?.trim() ?? ''
    const name = trk?.name?.trim() || 'Activity'
    return {
        format: 'gpx',
        startedAt: first,
        sportType: type || null,
        category: ['running', 'run'].includes(type.toLowerCase()) ? 'run' : 'other',
        name,
        distanceM: distance,
        // GPX has no moving time: it equals the elapsed time.
        movingTimeS: elapsed,
        elapsedTimeS: elapsed,
        elevationGainM: gain,
        avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
        maxHr: hrs.length ? Math.round(Math.max(...hrs)) : null,
        avgSpeedMps: distance !== null && elapsed > 0 ? distance / elapsed : null,
        calories: null,
        noteText: null,
        laps: [],
    }
}

export function parseGpx(bytes: Uint8Array) {
    return Effect.try({
        try: () => {
            const activity = build(parseXml(bytes))
            if (!activity) throw new Error('empty gpx')
            return activity
        },
        catch: (cause) =>
            new ActivityFileParseError({
                cause: cause instanceof Error ? cause.name : 'unknown',
                error_hash: ErrorCode.TRAINING_FILE_PARSE,
            }),
    })
}
