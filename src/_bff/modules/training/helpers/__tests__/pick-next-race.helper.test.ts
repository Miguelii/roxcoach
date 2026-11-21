import { describe, expect, it } from 'vitest'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { pickNextRace } from '@/_bff/modules/training/helpers/pick-next-race.helper'

const race = (overrides: Partial<RaceDTO>): RaceDTO => ({
    id: 'r1',
    name: 'Race',
    raceType: 'hyrox',
    raceDate: '2026-12-10',
    location: null,
    distanceM: null,
    hyroxDivision: null,
    targetTimeS: 4200,
    priority: 'B',
    status: 'upcoming',
    resultTimeS: null,
    notes: null,
    ...overrides,
})

describe('pickNextRace', () => {
    it('accepts upcoming hyrox races and running races with a distance', () => {
        expect(pickNextRace([race({ id: 'h' })])?.id).toBe('h')
        expect(pickNextRace([race({ id: 'r', raceType: 'running', distanceM: 10_000 })])?.id).toBe(
            'r'
        )
    })

    it('ignores finished races and running races without a distance', () => {
        expect(pickNextRace([race({ status: 'completed' })])).toBeNull()
        expect(pickNextRace([race({ status: 'cancelled' })])).toBeNull()
        expect(pickNextRace([race({ raceType: 'running', distanceM: null })])).toBeNull()
        expect(pickNextRace([race({ raceType: 'other', distanceM: 5000 })])).toBeNull()
        expect(pickNextRace([])).toBeNull()
    })

    it('prefers priority, then the earliest date, then the name', () => {
        const picked = pickNextRace([
            race({ id: 'b-early', priority: 'B', raceDate: '2026-12-01' }),
            race({ id: 'a-late', priority: 'A', raceDate: '2027-02-01' }),
            race({ id: 'a-early-z', priority: 'A', raceDate: '2027-01-01', name: 'Z' }),
            race({ id: 'a-early-a', priority: 'A', raceDate: '2027-01-01', name: 'A' }),
        ])
        expect(picked?.id).toBe('a-early-a')
    })
})
