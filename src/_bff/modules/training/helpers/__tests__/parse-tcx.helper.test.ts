// @vitest-environment node
import { readFileSync } from 'node:fs'
import { Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { parseTcx } from '@/_bff/modules/training/helpers/parse-tcx.helper'

const FIXTURES = new URL('./fixtures/', import.meta.url)
const enc = (s: string) => new TextEncoder().encode(s)
const run = (bytes: Uint8Array) => Effect.runSync(Effect.result(parseTcx(bytes)))

const lap = (start: string, time: number, dist: number, cal: number, avg: number, max: number) =>
    `<Lap StartTime="${start}"><TotalTimeSeconds>${time}</TotalTimeSeconds><DistanceMeters>${dist}</DistanceMeters><Calories>${cal}</Calories><AverageHeartRateBpm><Value>${avg}</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>${max}</Value></MaximumHeartRateBpm></Lap>`
const doc = (sport: string, body: string) =>
    `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="${sport}">${body}</Activity></Activities></TrainingCenterDatabase>`

describe('parseTcx on the real Zepp file', () => {
    it('maps the lap and the note', () => {
        const result = run(new Uint8Array(readFileSync(new URL('zepp-hyrox-test.tcx', FIXTURES))))
        if (Result.isFailure(result)) throw new Error('expected success')
        const a = result.success
        expect(a.format).toBe('tcx')
        expect(a.startedAt).toBe('2026-11-20T12:08:19.000Z')
        expect(a.laps).toHaveLength(1)
        expect(a.elapsedTimeS).toBe(133)
        expect(a.avgHr).toBe(98)
        expect(a.maxHr).toBe(104)
        expect(a.calories).toBe(7)
        expect(a.distanceM).toBeNull()
        expect(a.noteText).toBe('Corrida HYROX')
        expect(a.sportType).toBe('Other')
        expect(a.category).toBe('other')
        expect(a.name).toBe('Corrida HYROX')
    })
})

describe('parseTcx synthetic', () => {
    it('sums several running laps', () => {
        const xml = doc(
            'Running',
            lap('2026-01-01T10:00:00Z', 300, 1000, 50, 140, 160) +
                lap('2026-01-01T10:05:00Z', 310, 1000, 52, 150, 170)
        )
        const result = run(enc(xml))
        if (Result.isFailure(result)) throw new Error('expected success')
        const a = result.success
        expect(a.category).toBe('run')
        expect(a.laps).toHaveLength(2)
        expect(a.distanceM).toBe(2000)
        expect(a.elapsedTimeS).toBe(610)
        expect(a.calories).toBe(102)
        expect(a.maxHr).toBe(170)
        expect(a.avgHr).toBe(145)
        expect(a.startedAt).toBe('2026-01-01T10:00:00.000Z')
        expect(a.laps[1]?.lapIndex).toBe(1)
        expect(a.avgSpeedMps).toBeCloseTo(2000 / 610)
    })

    it('fails without a Lap', () => {
        const result = run(enc(doc('Running', '<Id>2026-01-01T10:00:00Z</Id>')))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
    })

    it('fails on garbage', () => {
        const result = run(enc('nope'))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
    })

    it('rejects an entity declaration even with a valid Lap', () => {
        const xml = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY b "bbb">]><TrainingCenterDatabase><Activities><Activity Sport="Running"><Notes>&b;</Notes>${lap('2026-01-01T10:00:00Z', 60, 100, 5, 100, 110)}</Activity></Activities></TrainingCenterDatabase>`
        const result = run(enc(xml))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
    })

    it('decodes the predefined entities in the note', () => {
        const xml = doc(
            'Running',
            `<Notes>Tom &amp; Jerry &lt;x&gt; &amp;lt;</Notes>${lap('2026-01-01T10:00:00Z', 60, 100, 5, 100, 110)}`
        )
        const result = run(enc(xml))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.noteText).toBe('Tom & Jerry <x> &lt;')
        expect(result.success.name).toBe('Tom & Jerry <x> &lt;')
    })

    it('weights the average heart rate by lap duration', () => {
        const xml = doc(
            'Running',
            lap('2026-01-01T10:00:00Z', 10, 30, 1, 100, 110) +
                lap('2026-01-01T10:00:10Z', 1800, 5000, 100, 150, 170)
        )
        const result = run(enc(xml))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.avgHr).toBe(150)
    })

    it('uses the first trackpoint time when a lap has no StartTime', () => {
        const noStart =
            '<Lap><TotalTimeSeconds>60</TotalTimeSeconds><AverageHeartRateBpm><Value>120</Value></AverageHeartRateBpm><Track><Trackpoint><Time>2026-01-01T10:00:05Z</Time></Trackpoint></Track></Lap>'
        const result = run(enc(doc('Running', noStart)))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.startedAt).toBe('2026-01-01T10:00:05.000Z')
        expect(result.success.laps).toHaveLength(1)
        expect(result.success.avgHr).toBe(120)
    })

    it('fails when no lap has any start', () => {
        const result = run(
            enc(doc('Running', '<Lap><TotalTimeSeconds>60</TotalTimeSeconds></Lap>'))
        )
        expect(Result.isFailure(result)).toBe(true)
    })

    it('computes totals only from laps that have a start', () => {
        const bad =
            '<Lap><TotalTimeSeconds>500</TotalTimeSeconds><DistanceMeters>900</DistanceMeters><Calories>40</Calories><AverageHeartRateBpm><Value>200</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>220</Value></MaximumHeartRateBpm></Lap>'
        const result = run(
            enc(doc('Running', lap('2026-01-01T10:00:00Z', 60, 100, 5, 100, 110) + bad))
        )
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.elapsedTimeS).toBe(60)
        expect(result.success.avgHr).toBe(100)
        expect(result.success.maxHr).toBe(110)
        expect(result.success.calories).toBe(5)
    })
})
