// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { gpxSamples, parseGpx } from '@/_bff/modules/training/helpers/parse-gpx.helper'

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

    it('uses min and max timestamps for out-of-order points', () => {
        const result = run(
            gpx(
                'running',
                pt(0, 0.02, 1, '2026-01-01T10:10:00Z') +
                    pt(0, 0, 1, '2026-01-01T10:00:00Z') +
                    pt(0, 0.01, 1, '2026-01-01T10:05:00Z')
            )
        )
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.startedAt).toBe('2026-01-01T10:00:00.000Z')
        expect(result.success.elapsedTimeS).toBe(600)
    })

    it('does not bridge the gap between segments or tracks', () => {
        const seg = (a: string) => `<trkseg>${a}</trkseg>`
        const xml = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk>${seg(
            pt(0, 0, 0, '2026-01-01T10:00:00Z') + pt(0, 0.01, 10, '2026-01-01T10:01:00Z')
        )}${seg(pt(1, 1, 0, '2026-01-01T10:02:00Z') + pt(1, 1.01, 10, '2026-01-01T10:03:00Z'))}</trk></gpx>`
        const result = run(xml)
        if (Result.isFailure(result)) throw new Error('expected success')
        // two segments of about 1112 m each, nothing for the 150 km jump
        expect(result.success.distanceM).toBeGreaterThan(2200)
        expect(result.success.distanceM).toBeLessThan(2250)
        expect(result.success.elevationGainM).toBe(20)
    })

    it('accepts empty trkseg and trk elements', () => {
        const xml = `<?xml version="1.0"?><gpx><trk/><trk><trkseg/><trkseg>${pt(0, 0, 1, '2026-01-01T10:00:00Z')}</trkseg></trk></gpx>`
        const result = run(xml)
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.startedAt).toBe('2026-01-01T10:00:00.000Z')
    })

    it('handles a single point', () => {
        const result = run(gpx('running', pt(0, 0, 5, '2026-01-01T10:00:00Z', 120)))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.elapsedTimeS).toBe(0)
        expect(result.success.distanceM).toBeNull()
        expect(result.success.avgSpeedMps).toBeNull()
        expect(result.success.avgHr).toBe(120)
    })

    it('gives null elevation gain without ele', () => {
        const noEle = (t: string) => `<trkpt lat="0" lon="0"><time>${t}</time></trkpt>`
        const result = run(
            gpx('running', noEle('2026-01-01T10:00:00Z') + noEle('2026-01-01T10:00:05Z'))
        )
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.elevationGainM).toBeNull()
    })

    it('reads a timestamp without a zone as UTC', () => {
        const result = run(gpx('running', pt(0, 0, 1, '2026-01-01T10:00:00')))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.startedAt).toBe('2026-01-01T10:00:00.000Z')
    })
})

describe('parseGpx hrHistogram', () => {
    // 0.00003 degrees of longitude at the equator is about 3.3 m.
    const walk = (hr?: number) =>
        [0, 1, 2, 3, 4].map((s) => pt(0, s * 0.00003, 10, `2026-01-01T10:00:0${s}Z`, hr)).join('')

    it('bins the usable intervals of points with heart rate', () => {
        const result = run(gpx('running', walk(150)))
        if (Result.isFailure(result)) throw new Error('expected success')
        const { bins } = result.success.hrHistogram
        expect(bins.length).toBeGreaterThan(0)
        expect(bins.reduce((a, b) => a + b[1], 0)).toBe(4)
        expect(bins[0]?.[0]).toBe(150)
    })

    it('returns an empty histogram without heart rate and keeps the rest unchanged', () => {
        const result = run(gpx('running', walk()))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.hrHistogram).toEqual({ v: 1, bins: [] })
        expect(result.success.avgHr).toBeNull()
        expect(result.success.elapsedTimeS).toBe(4)
        expect(result.success.distanceM).toBeGreaterThan(0)
    })
})

describe('gpxSamples', () => {
    const p = (lat: number | null, lon: number | null, time: string) => ({
        lat,
        lon,
        ele: null,
        time,
        hr: 140,
    })

    it('restarts the cumulative distance per segment', () => {
        const samples = gpxSamples([
            [p(0, 0, '2026-01-01T10:00:00Z'), p(0, 0.001, '2026-01-01T10:00:01Z')],
            [p(1, 1, '2026-01-01T11:00:00Z'), p(1, 1.001, '2026-01-01T11:00:01Z')],
        ])
        expect(samples[0]?.distanceM).toBe(0)
        expect(samples[2]?.distanceM).toBe(0)
        expect(samples[3]?.distanceM).toBeCloseTo(samples[1]?.distanceM ?? 0, -1)
    })

    it('leaves distance null without coordinates and never emits NaN', () => {
        const samples = gpxSamples([
            [p(null, null, '2026-01-01T10:00:00Z'), p(0, 0, '2026-01-01T10:00:01Z')],
        ])
        expect(samples[0]?.distanceM).toBeNull()
        expect(samples.every((s) => Number.isFinite(s.t))).toBe(true)
    })
})
