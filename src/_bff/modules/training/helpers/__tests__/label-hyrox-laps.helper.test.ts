// @vitest-environment node
import { readFileSync } from 'node:fs'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { HYROX_STATION_ORDER } from '@/_bff/core/constants/hyrox.constants'
import { labelHyroxLaps } from '@/_bff/modules/training/helpers/label-hyrox-laps.helper'
import { parseFit } from '@/_bff/modules/training/helpers/parse-fit.helper'
import type { ParsedLap } from '@/_bff/modules/training/types'

const FIXTURES = new URL('./fixtures/', import.meta.url)

const lap = (lapIndex: number): ParsedLap => ({
    lapIndex,
    name: null,
    startedAt: '2026-11-20T12:08:19.000Z',
    elapsedTimeS: 60,
    movingTimeS: 60,
    distanceM: null,
    avgHr: null,
    avgSpeedMps: null,
    calories: null,
})
const laps = (n: number) => Array.from({ length: n }, (_, i) => lap(i))

describe('labelHyroxLaps (heuristic by lap order)', () => {
    it('labels 16 laps as 8 runs (null) alternating with the 8 stations in order', () => {
        expect(labelHyroxLaps(laps(16))).toEqual([
            null,
            'ski_erg',
            null,
            'sled_push',
            null,
            'sled_pull',
            null,
            'burpee_broad_jump',
            null,
            'rowing',
            null,
            'farmers_carry',
            null,
            'sandbag_lunges',
            null,
            'wall_balls',
        ])
        expect(HYROX_STATION_ORDER[0]).toBe('ski_erg')
    })

    it('returns null for 15 laps', () => {
        expect(labelHyroxLaps(laps(15))).toBeNull()
    })

    it('returns null for 17 laps', () => {
        expect(labelHyroxLaps(laps(17))).toBeNull()
    })

    it('returns null for 0 laps', () => {
        expect(labelHyroxLaps([])).toBeNull()
    })

    it('returns null for the real Zepp sample (3 laps)', async () => {
        const bytes = new Uint8Array(readFileSync(new URL('zepp-hyrox-test.fit', FIXTURES)))
        const activity = await Effect.runPromise(parseFit(bytes))
        expect(activity.laps).toHaveLength(3)
        expect(labelHyroxLaps(activity.laps)).toBeNull()
    })
})
