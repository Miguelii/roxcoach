import { describe, expect, it } from 'vitest'
import { zoneBoundsBpm, zoneOfHeartRate } from '@/_bff/core/constants/hr-zones.constants'

const bounds = zoneBoundsBpm({ maxHr: 190, restingHr: 50 })

describe('zoneBoundsBpm', () => {
    it('builds Karvonen bounds from the heart rate reserve', () => {
        expect(bounds).toEqual([
            { zone: 1, fromBpm: 0, toBpm: 133 },
            { zone: 2, fromBpm: 134, toBpm: 147 },
            { zone: 3, fromBpm: 148, toBpm: 161 },
            { zone: 4, fromBpm: 162, toBpm: 175 },
            { zone: 5, fromBpm: 176, toBpm: null },
        ])
    })

    it('returns null when a heart rate is missing', () => {
        expect(zoneBoundsBpm({ maxHr: null, restingHr: 50 })).toBeNull()
        expect(zoneBoundsBpm({ maxHr: 190, restingHr: null })).toBeNull()
    })

    it('returns null when max is not above resting', () => {
        expect(zoneBoundsBpm({ maxHr: 50, restingHr: 50 })).toBeNull()
        expect(zoneBoundsBpm({ maxHr: 40, restingHr: 60 })).toBeNull()
    })
})

describe('zoneOfHeartRate', () => {
    it.each([
        [40, 1],
        [133, 1],
        [134, 2],
        [147, 2],
        [148, 3],
        [176, 5],
        [220, 5],
    ])('puts %d bpm in Z%d', (bpm, zone) => {
        expect(zoneOfHeartRate(bpm, bounds ?? [])).toBe(zone)
    })
})
