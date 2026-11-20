// @vitest-environment node
import { Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { parseGpx } from '@/_bff/modules/training/helpers/parse-gpx.helper'

const enc = (s: string) => new TextEncoder().encode(s)
const run = (xml: string) => Effect.runSync(Effect.result(parseGpx(enc(xml))))
const gpx = (type: string, pts: string) =>
    `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Morning run</name><type>${type}</type><trkseg>${pts}</trkseg></trk></gpx>`
const pt = (lat: number, lon: number, ele: number, time: string, hr?: number) =>
    `<trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele><time>${time}</time>${
        hr === undefined
            ? ''
            : `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`
    }</trkpt>`

describe('parseGpx', () => {
    it('derives distance, time, elevation and heart rate', () => {
        const result = run(
            gpx(
                'running',
                pt(0, 0, 10, '2026-01-01T10:00:00Z', 140) +
                    pt(0, 0.01, 15, '2026-01-01T10:05:00Z', 150) +
                    pt(0, 0.02, 12, '2026-01-01T10:10:00Z', 160)
            )
        )
        if (Result.isFailure(result)) throw new Error('expected success')
        const a = result.success
        expect(a.format).toBe('gpx')
        expect(a.category).toBe('run')
        expect(a.name).toBe('Morning run')
        expect(a.startedAt).toBe('2026-01-01T10:00:00.000Z')
        expect(a.elapsedTimeS).toBe(600)
        expect(a.distanceM).toBeGreaterThan(2210)
        expect(a.distanceM).toBeLessThan(2230)
        expect(a.elevationGainM).toBe(5)
        expect(a.avgHr).toBe(150)
        expect(a.maxHr).toBe(160)
        expect(a.avgSpeedMps).toBeCloseTo((a.distanceM ?? 0) / 600)
        expect(a.laps).toEqual([])
    })

    it('gives null heart rate without the extension', () => {
        const result = run(
            gpx(
                'cycling',
                pt(0, 0, 1, '2026-01-01T10:00:00Z') + pt(0, 0.01, 1, '2026-01-01T10:01:00Z')
            )
        )
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.avgHr).toBeNull()
        expect(result.success.maxHr).toBeNull()
        expect(result.success.category).toBe('other')
    })

    it('fails when no point has a timestamp', () => {
        const result = run(gpx('running', '<trkpt lat="0" lon="0"><ele>1</ele></trkpt>'))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
    })
})
