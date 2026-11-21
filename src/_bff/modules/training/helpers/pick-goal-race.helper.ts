import type { RaceDTO } from '@/_bff/modules/races/types'

const PRIORITY_ORDER = { A: 0, B: 1, C: 2 } as const

// The upcoming running race with a distance that the athlete cares about most: priority A to C,
// then the earliest date, then name.
export function pickGoalRace(races: RaceDTO[]): RaceDTO | null {
    const candidates = races.filter(
        (race) =>
            race.raceType === 'running' && race.distanceM !== null && race.status === 'upcoming'
    )
    candidates.sort(
        (a, b) =>
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
            a.raceDate.localeCompare(b.raceDate) ||
            a.name.localeCompare(b.name)
    )
    return candidates[0] ?? null
}
