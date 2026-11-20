import { Effect } from 'effect'
import { z } from 'zod'
import { ActivityFileParseError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { isoOf, numOf, parseXml, type XmlTree } from '@/_bff/modules/training/helpers/xml.helper'
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
// An empty element arrives as '' and is read as an empty container.
const segSchema = z
    .union([z.object({ trkpt: z.array(pointSchema).default([]) }), z.literal('')])
    .transform((v) => (v === '' ? { trkpt: [] } : v))
const trkSchema = z
    .union([
        z.object({ name: leaf, type: leaf, trkseg: z.array(segSchema).default([]) }),
        z.literal(''),
    ])
    .transform((v) => (v === '' ? { name: undefined, type: undefined, trkseg: [] } : v))
const gpxSchema = z.object({ gpx: z.object({ trk: z.array(trkSchema).default([]) }) })
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

const sumOf = (values: number[]) => values.reduce((a, b) => a + b, 0)

// Distance and elevation gain are summed per segment: the gap between segments is never bridged.
function segmentStats(segment: Point[]) {
    const positions = segment.flatMap((p) =>
        p.lat !== null && p.lon !== null ? [{ lat: p.lat, lon: p.lon }] : []
    )
    const eles = segment.flatMap((p) => p.ele ?? [])
    return {
        positions: positions.length,
        distance: sumOf(positions.slice(1).map((p, i) => haversine(positions[i]!, p))),
        eles: eles.length,
        gain: sumOf(eles.slice(1).map((e, i) => Math.max(0, e - eles[i]!))),
    }
}

function build(root: XmlTree): ParsedActivity | null {
    const trks = gpxSchema.parse(root).gpx.trk
    const segments = trks.flatMap((t) => t.trkseg.map((s) => s.trkpt.map(readPoint)))
    const points = segments.flat()
    const times = points.flatMap((p) => p.time ?? []).map((t) => Date.parse(t))
    if (!times.length) return null
    const min = times.reduce((a, b) => Math.min(a, b), Infinity)
    const max = times.reduce((a, b) => Math.max(a, b), -Infinity)
    const first = new Date(min).toISOString()
    const elapsed = Math.round((max - min) / 1000)

    const stats = segments.map(segmentStats)
    const distance = stats.some((s) => s.positions > 1) ? sumOf(stats.map((s) => s.distance)) : null
    const gain = stats.some((s) => s.eles > 0) ? sumOf(stats.map((s) => s.gain)) : null
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
        maxHr: hrs.length ? Math.round(hrs.reduce((a, b) => Math.max(a, b), -Infinity)) : null,
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
