import { describe, expect, it } from 'vitest'
import { racePaceSPerKm } from '@/_bff/core/utils/race-pace.utils'

const race = (raceType: string, distanceM: number | null, targetTimeS: number) => ({
    raceType,
    distanceM,
    targetTimeS,
})

describe('racePaceSPerKm', () => {
    it('derives the pace of a race with a distance from the goal time', () => {
        expect(racePaceSPerKm(race('running', 10_000, 2700))).toBe(270)
    })

    it('uses the tier pace exactly on a tier', () => {
        expect(racePaceSPerKm(race('hyrox', null, 5400))).toBe(355)
        expect(racePaceSPerKm(race('hyrox', null, 3600))).toBe(238)
    })

    it('interpolates between tiers', () => {
        expect(racePaceSPerKm(race('hyrox', null, 4200))).toBeCloseTo(276, 0)
    })

    it('uses the nearest tier outside the table', () => {
        expect(racePaceSPerKm(race('hyrox', null, 3000))).toBe(238)
        expect(racePaceSPerKm(race('hyrox', null, 9000))).toBe(413)
    })

    it('returns null without a distance for a non hyrox race, or with a zero distance', () => {
        expect(racePaceSPerKm(race('other', null, 3000))).toBeNull()
        expect(racePaceSPerKm(race('running', 0, 3000))).toBeNull()
    })
})
