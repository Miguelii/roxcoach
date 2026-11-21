// @vitest-environment node
import { readFileSync } from 'node:fs'
import { Encoder, Profile } from '@garmin/fitsdk'
import { Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import {
    categoryFromSport,
    fitSamples,
    parseFit,
} from '@/_bff/modules/training/helpers/parse-fit.helper'
import { parseActivityFile } from '@/_bff/modules/training/helpers/parse-activity-file.helper'

const FIXTURES = new URL('./fixtures/', import.meta.url)
const real = () => new Uint8Array(readFileSync(new URL('zepp-hyrox-test.fit', FIXTURES)))
const run = (bytes: Uint8Array) => Effect.runSync(Effect.result(parseFit(bytes)))

describe('parseFit on the real Zepp file', () => {
    it('maps the session and laps', () => {
        const result = run(real())
        if (Result.isFailure(result)) throw new Error('expected success')
        const a = result.success
        expect(a.format).toBe('fit')
        expect(a.startedAt).toBe('2026-11-20T12:08:19.000Z')
        expect(a.elapsedTimeS).toBe(133)
        expect(a.movingTimeS).toBe(133)
        expect(a.avgHr).toBe(98)
        expect(a.maxHr).toBe(104)
        expect(a.calories).toBe(7)
        expect(a.distanceM).toBeNull()
        expect(a.sportType).toBeTruthy()
        expect(a.category).toBe('other')
        expect(a.laps).toHaveLength(3)
        expect(a.laps.map((l) => l.lapIndex)).toEqual([0, 1, 2])
        expect(a.laps[0]?.startedAt).toBe('2026-11-20T12:08:19.000Z')
        expect(a.laps[0]?.elapsedTimeS).toBe(105)
        expect(a.laps[0]?.movingTimeS).toBe(95)
        expect(a.laps[0]?.avgHr).toBe(97)
        expect(a.laps[0]?.calories).toBe(5)
        expect(a.laps.every((l) => l.name === null)).toBe(true)
    })
})

describe('parseFit failures', () => {
    it('fails on a truncated file', () => {
        const result = run(real().slice(0, 40))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
    })

    it('fails on empty input', () => {
        const result = run(new Uint8Array())
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
    })

    it('fails on plain text', () => {
        const result = run(new TextEncoder().encode('not a fit file at all'))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
    })
})

function buildFit(
    records: { timestamp: Date; heartRate?: number; distance?: number; speed?: number }[]
) {
    const encoder = new Encoder()
    const fileId = {
        mesgNum: Profile.MesgNum.FILE_ID,
        type: 'activity',
        manufacturer: 'development',
        product: 0,
        timeCreated: new Date('2026-01-01T10:00:00Z'),
        serialNumber: 1,
    }
    encoder.onMesg(Profile.MesgNum.FILE_ID, fileId)
    for (const r of records)
        encoder.onMesg(Profile.MesgNum.RECORD, { mesgNum: Profile.MesgNum.RECORD, ...r })
    return encoder.close()
}

describe('parseFit without a session message', () => {
    it('derives totals from the records', () => {
        const bytes = buildFit([
            { timestamp: new Date('2026-01-01T10:00:00Z'), heartRate: 100 },
            { timestamp: new Date('2026-01-01T10:00:10Z'), heartRate: 140 },
        ])
        const result = run(bytes)
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.startedAt).toBe('2026-01-01T10:00:00.000Z')
        expect(result.success.elapsedTimeS).toBe(10)
        expect(result.success.avgHr).toBe(120)
        expect(result.success.maxHr).toBe(140)
    })

    it('fails with neither records nor session', () => {
        const result = run(buildFit([]))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
    })

    it('handles a large record list without failing', () => {
        const start = Date.parse('2026-01-01T10:00:00Z')
        const records = Array.from({ length: 200000 }, (_, i) => ({
            timestamp: new Date(start + i * 1000),
            heartRate: 100 + (i % 60),
        }))
        const result = run(buildFit(records))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.maxHr).toBe(159)
        expect(result.success.elapsedTimeS).toBe(199999)
    }, 60000)
})

describe('parseActivityFile', () => {
    it('dispatches FIT', () => {
        const result = Effect.runSync(Effect.result(parseActivityFile(real())))
        expect(Result.isSuccess(result)).toBe(true)
    })

    it('parses real FIT bytes regardless of any label', () => {
        const labelled = { name: 'activity.gpx', bytes: real() }
        const result = Effect.runSync(Effect.result(parseActivityFile(labelled.bytes)))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.format).toBe('fit')
    })

    it('rejects text bytes under a .fit name as unsupported', () => {
        const labelled = { name: 'activity.fit', bytes: new TextEncoder().encode('plain text') }
        const result = Effect.runSync(Effect.result(parseActivityFile(labelled.bytes)))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result))
            expect(result.failure._tag).toBe('UnsupportedActivityFileError')
    })

    it('rejects unknown content as unsupported', () => {
        const result = Effect.runSync(
            Effect.result(parseActivityFile(new TextEncoder().encode('hello')))
        )
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result))
            expect(result.failure._tag).toBe('UnsupportedActivityFileError')
    })
})

describe('categoryFromSport', () => {
    it('maps sports', () => {
        expect(categoryFromSport('running')).toBe('run')
        expect(categoryFromSport('cross_training')).toBe('cross')
        expect(categoryFromSport('training', 'strength_training')).toBe('strength')
        expect(categoryFromSport('training', 'exercise')).toBe('other')
        expect(categoryFromSport('cycling')).toBe('other')
        expect(categoryFromSport(null)).toBe('other')
    })
})

describe('parseFit hrHistogram', () => {
    const at = (s: number) => new Date(Date.parse('2026-01-01T10:00:00Z') + s * 1000)

    it('bins the usable intervals of records with heart rate and distance', () => {
        const bytes = buildFit(
            [0, 1, 2, 3, 4].map((s) => ({ timestamp: at(s), heartRate: 120, distance: s * 3 }))
        )
        const result = run(bytes)
        if (Result.isFailure(result)) throw new Error('expected success')
        const { bins } = result.success.hrHistogram
        expect(bins.length).toBeGreaterThan(0)
        expect(bins.reduce((a, b) => a + b[1], 0)).toBe(4)
        expect(bins[0]?.[0]).toBe(120)
    })

    it('returns an empty histogram without heart rate and keeps the rest unchanged', () => {
        const result = run(
            buildFit([
                { timestamp: at(0), distance: 0 },
                { timestamp: at(10), distance: 30 },
            ])
        )
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.hrHistogram).toEqual({ v: 1, bins: [] })
        expect(result.success.elapsedTimeS).toBe(10)
        expect(result.success.avgHr).toBeNull()
    })

    it('builds a pace histogram from distance without needing heart rate', () => {
        const result = run(
            buildFit([0, 1, 2, 3, 4].map((s) => ({ timestamp: at(s), distance: s * 4 })))
        )
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.paceHistogram.bins).toEqual([[250, 4, 16]])
        expect(result.success.hrHistogram).toEqual({ v: 1, bins: [] })
    })

    it('has a histogram on the real Zepp file', () => {
        const result = run(real())
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.hrHistogram.v).toBe(1)
    })
})

describe('fitSamples', () => {
    it('maps fields, prefers enhancedSpeed and never emits NaN', () => {
        const samples = fitSamples([
            {
                timestamp: new Date(1000),
                heartRate: 100,
                distance: 5,
                enhancedSpeed: 3,
                speed: 2,
            },
            { timestamp: new Date(2000), heartRate: Number.NaN, speed: 2 },
            { timestamp: new Date(Number.NaN), heartRate: 90 },
        ])
        expect(samples).toEqual([
            { t: 1000, hr: 100, distanceM: 5, speedMps: 3 },
            { t: 2000, hr: null, distanceM: null, speedMps: 2 },
        ])
    })

    it('returns no heart rate when records have none', () => {
        const samples = fitSamples([{ timestamp: new Date(1000) }])
        expect(samples.every((s) => s.hr === null)).toBe(true)
    })
})
