import { describe, expect, it } from 'vitest'
import { pickNextRace } from '@/modules/dashboard/pick-next-race'
import { DONE_RACE, HYROX_RACE, RUN_RACE, TODAY } from '@/modules/races/__tests__/fixtures'

describe('pickNextRace', () => {
    it('includes a race dated today', () => {
        const today = { ...RUN_RACE, raceDate: TODAY }
        expect(pickNextRace([today, HYROX_RACE], TODAY)).toBe(today)
    })

    it('skips a stale upcoming race in the past', () => {
        const stale = { ...RUN_RACE, raceDate: '2026-11-01' }
        expect(pickNextRace([stale, HYROX_RACE], TODAY)).toBe(HYROX_RACE)
    })

    it('skips races that are not upcoming', () => {
        expect(pickNextRace([{ ...DONE_RACE, raceDate: TODAY }], TODAY)).toBeNull()
    })

    it('returns null without races', () => {
        expect(pickNextRace([], TODAY)).toBeNull()
        expect(pickNextRace([{ ...RUN_RACE, raceDate: '2026-11-01' }], TODAY)).toBeNull()
    })
})
