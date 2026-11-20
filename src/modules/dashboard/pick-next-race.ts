import type { RaceDTO } from '@/_bff/modules/races/types'

// The first upcoming race dated today or later, given races ordered by date. A stale upcoming race
// from the past is skipped.
export const pickNextRace = (races: RaceDTO[], today: string): RaceDTO | null =>
    races.find((race) => race.status === 'upcoming' && race.raceDate >= today) ?? null
