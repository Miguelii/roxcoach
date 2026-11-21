import { HYROX_RUN_PACE_TIERS } from '@/_bff/core/constants/race-pace.constants'

type RaceLike = { raceType: string; distanceM: number | null; targetTimeS: number }

// Linear interpolation between the surrounding tiers, the nearest tier outside the table.
function hyroxRunPace(targetTimeS: number): number {
    const tiers = HYROX_RUN_PACE_TIERS
    const first = tiers[0]!
    const last = tiers.at(-1)!
    if (targetTimeS <= first.goalS) return first.paceSPerKm
    if (targetTimeS >= last.goalS) return last.paceSPerKm
    const upperIndex = tiers.findIndex((tier) => tier.goalS >= targetTimeS)
    const lower = tiers[upperIndex - 1]!
    const upper = tiers[upperIndex]!
    const share = (targetTimeS - lower.goalS) / (upper.goalS - lower.goalS)
    return lower.paceSPerKm + share * (upper.paceSPerKm - lower.paceSPerKm)
}

// Run pace of the race in seconds per km: from the distance and goal time when there is a
// distance, from the Hyrox pace table for a Hyrox, otherwise null.
export function racePaceSPerKm(race: RaceLike): number | null {
    if (race.distanceM !== null && race.distanceM > 0) {
        return race.targetTimeS / (race.distanceM / 1000)
    }
    if (race.raceType === 'hyrox') return hyroxRunPace(race.targetTimeS)
    return null
}
