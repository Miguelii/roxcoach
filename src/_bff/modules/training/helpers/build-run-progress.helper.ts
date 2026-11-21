import {
    zoneOfHeartRate,
    type HrZoneBounds,
    type ZoneNumber,
} from '@/_bff/core/constants/hr-zones.constants'
import { MIN_ZONE_SAMPLE_S, type ProgressRange } from '@/_bff/core/constants/progress.constants'
import { bucketStartOf, bucketStarts, rangeBounds } from '@/_bff/core/utils/progress-range.utils'
import { DAY_MS, parseIsoDate } from '@/_bff/core/utils/week-dates.utils'
import type { RaceDTO } from '@/_bff/modules/races/types'
import { buildRaceReadiness } from '@/_bff/modules/training/helpers/build-race-readiness.helper'
import type {
    HrHistogram,
    PaceHistogram,
    RunBucketDTO,
    RunGoalDTO,
    RunProgressDTO,
    RunZonePointDTO,
} from '@/_bff/modules/training/types/progress'

type RunRow = {
    localDate: string
    distanceM: number | null
    movingTimeS: number | null
    avgHr: number | null
    hrHistogram: HrHistogram | null
    paceHistogram: PaceHistogram | null
}

type Input = {
    runs: RunRow[]
    today: string
    range: ProgressRange
    zoneBounds: HrZoneBounds[] | null
    goalRace: RaceDTO | null
    // The race the readiness card is about (running or Hyrox), null when there is none.
    nextRace: RaceDTO | null
}

type ZoneTotals = { timeS: number; distanceM: number }

type Accumulator = {
    distanceM: number
    movingTimeS: number
    runs: number
    // Heart rate times moving time, and the moving time that has a heart rate.
    hrTimeProduct: number
    hrTimeS: number
    zones: Map<ZoneNumber, ZoneTotals>
}

const ZONES: ZoneNumber[] = [1, 2, 3, 4, 5]

const paceOf = (movingTimeS: number, distanceM: number) =>
    distanceM > 0 ? movingTimeS / (distanceM / 1000) : null

function buildGoal(goalRace: RaceDTO | null, today: string): RunGoalDTO | null {
    if (goalRace === null || goalRace.distanceM === null) return null
    const days = Math.round(
        (parseIsoDate(goalRace.raceDate).getTime() - parseIsoDate(today).getTime()) / DAY_MS
    )
    return {
        raceId: goalRace.id,
        name: goalRace.name,
        raceDate: goalRace.raceDate,
        daysLeft: Math.max(0, days),
        distanceM: goalRace.distanceM,
        targetTimeS: goalRace.targetTimeS,
        paceSecPerKm: goalRace.targetTimeS / (goalRace.distanceM / 1000),
    }
}

function addHistogram(acc: Accumulator, histogram: HrHistogram, bounds: HrZoneBounds[] | null) {
    if (bounds === null) return
    for (const [bpm, timeS, distanceM] of histogram.bins) {
        const zone = zoneOfHeartRate(bpm, bounds)
        const totals = acc.zones.get(zone) ?? { timeS: 0, distanceM: 0 }
        totals.timeS += timeS
        totals.distanceM += distanceM
        acc.zones.set(zone, totals)
    }
}

function zonePoints(acc: Accumulator): RunZonePointDTO[] {
    return ZONES.map((zone) => {
        const totals = acc.zones.get(zone)
        if (totals === undefined) return { zone, paceSecPerKm: null, minutes: 0 }
        const enough = totals.timeS >= MIN_ZONE_SAMPLE_S
        return {
            zone,
            paceSecPerKm: enough ? paceOf(totals.timeS, totals.distanceM) : null,
            minutes: totals.timeS / 60,
        }
    })
}

export function buildRunProgress({
    runs,
    today,
    range,
    zoneBounds,
    goalRace,
    nextRace,
}: Input): RunProgressDTO {
    const { from, granularity } = rangeBounds(today, range)
    const accumulators = new Map<string, Accumulator>()
    for (const start of bucketStarts(from, today, granularity)) {
        accumulators.set(start, {
            distanceM: 0,
            movingTimeS: 0,
            runs: 0,
            hrTimeProduct: 0,
            hrTimeS: 0,
            zones: new Map(),
        })
    }

    for (const run of runs) {
        const acc = accumulators.get(bucketStartOf(run.localDate, granularity))
        if (acc === undefined) continue
        const { distanceM, movingTimeS } = run
        if (distanceM !== null && movingTimeS !== null && distanceM > 0 && movingTimeS > 0) {
            acc.distanceM += distanceM
            acc.movingTimeS += movingTimeS
            acc.runs += 1
            if (run.avgHr !== null && run.avgHr > 0) {
                acc.hrTimeProduct += run.avgHr * movingTimeS
                acc.hrTimeS += movingTimeS
            }
        }
        if (run.hrHistogram !== null) addHistogram(acc, run.hrHistogram, zoneBounds)
    }

    const buckets: RunBucketDTO[] = [...accumulators].map(([start, acc]) => ({
        start,
        paceSecPerKm: paceOf(acc.movingTimeS, acc.distanceM),
        distanceKm: acc.distanceM / 1000,
        movingTimeS: acc.movingTimeS,
        runs: acc.runs,
        avgHrBpm: acc.hrTimeS > 0 ? Math.round(acc.hrTimeProduct / acc.hrTimeS) : null,
        zones: zonePoints(acc),
    }))

    const totalDistanceM = [...accumulators.values()].reduce((sum, a) => sum + a.distanceM, 0)
    const totalMovingS = [...accumulators.values()].reduce((sum, a) => sum + a.movingTimeS, 0)
    const recentPace = buckets.findLast((b) => b.paceSecPerKm !== null)?.paceSecPerKm ?? null
    const goal = buildGoal(goalRace, today)

    return {
        range,
        granularity,
        buckets,
        zoneBounds,
        hasZoneData:
            zoneBounds !== null &&
            buckets.some((b) => b.zones.some((z) => z.paceSecPerKm !== null)),
        goal,
        readiness: buildRaceReadiness({ runs, today, zoneBounds, race: nextRace }),
        kpis: {
            avgPaceSecPerKm: paceOf(totalMovingS, totalDistanceM),
            distanceKm: totalDistanceM / 1000,
            runs: buckets.reduce((sum, b) => sum + b.runs, 0),
            recentPaceSecPerKm: recentPace,
            goalDeltaSecPerKm:
                recentPace !== null && goal !== null ? recentPace - goal.paceSecPerKm : null,
        },
    }
}
