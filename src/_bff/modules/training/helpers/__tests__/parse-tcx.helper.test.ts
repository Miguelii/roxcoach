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

    it('fails on garbage and does not expand entities', () => {
        const bomb = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><TrainingCenterDatabase><Activities><Activity Sport="Running"><Notes>&b;</Notes></Activity></Activities></TrainingCenterDatabase>`
        for (const input of ['nope', bomb]) {
            const result = run(enc(input))
            expect(Result.isFailure(result)).toBe(true)
            if (Result.isFailure(result)) expect(result.failure._tag).toBe('ActivityFileParseError')
        }
    })
})
