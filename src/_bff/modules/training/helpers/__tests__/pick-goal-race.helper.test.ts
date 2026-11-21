import { describe, expect, it } from 'vitest'
import { pickGoalRace } from '@/_bff/modules/training/helpers/pick-goal-race.helper'
import type { RaceDTO } from '@/_bff/modules/races/types'

const race = (overrides: Partial<RaceDTO>): RaceDTO => ({
    id: 'r',
    name: 'Race',
    raceType: 'running',
    raceDate: '2027-03-01',
    location: null,
    distanceM: 10_000,
    hyroxDivision: null,
    targetTimeS: 3000,
    priority: 'A',
    status: 'upcoming',
    resultTimeS: null,
    notes: null,
    ...overrides,
})

describe('pickGoalRace', () => {
    it('returns null without candidates', () => {
        expect(pickGoalRace([])).toBeNull()
    })

    it('ignores hyrox, distance-less and finished races', () => {
        const races = [
            race({ id: 'h', raceType: 'hyrox' }),
            race({ id: 'n', distanceM: null }),
            race({ id: 'c', status: 'completed' }),
            race({ id: 'x', status: 'cancelled' }),
        ]
        expect(pickGoalRace(races)).toBeNull()
    })

    it('prefers priority over date', () => {
        const picked = pickGoalRace([
            race({ id: 'b', priority: 'B', raceDate: '2027-01-01' }),
            race({ id: 'a', priority: 'A', raceDate: '2027-06-01' }),
        ])
        expect(picked?.id).toBe('a')
    })

    it('breaks priority ties by earliest date then name', () => {
        const picked = pickGoalRace([
            race({ id: 'late', raceDate: '2027-06-01' }),
            race({ id: 'z', raceDate: '2027-02-01', name: 'Zed' }),
            race({ id: 'a', raceDate: '2027-02-01', name: 'Alpha' }),
        ])
        expect(picked?.id).toBe('a')
    })
})
