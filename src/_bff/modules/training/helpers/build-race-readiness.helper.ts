import { zoneOfHeartRate, type HrZoneBounds } from '@/_bff/core/constants/hr-zones.constants'
import { PACE_BIN_S } from '@/_bff/core/constants/progress.constants'
import { RACE_READINESS } from '@/_bff/core/constants/race-readiness.constants'
import { racePaceSPerKm } from '@/_bff/core/utils/race-pace.utils'
import { addDays, DAY_MS, parseIsoDate } from '@/_bff/core/utils/week-dates.utils'
import type { RaceDTO } from '@/_bff/modules/races/types'
import type {
    HrHistogram,
    PaceHistogram,
    ReadinessState,
    RunReadinessDTO,
} from '@/_bff/modules/training/types/progress'

type ReadinessRun = {
    localDate: string
    distanceM: number | null
    hrHistogram: HrHistogram | null
    paceHistogram: PaceHistogram | null
}

type Input = {
    runs: ReadinessRun[]
    today: string
    zoneBounds: HrZoneBounds[] | null
    race: RaceDTO | null
}

const WINDOW = RACE_READINESS.WINDOW_DAYS

const kmIn = (runs: ReadinessRun[], from: string, to: string) =>
    runs
        .filter((run) => run.localDate >= from && run.localDate <= to)
        .reduce((sum, run) => sum + (run.distanceM ?? 0) / 1000, 0)

// Share of the run time in Z1 and Z2, null without zones or without heart rate time.
function easyShare(runs: ReadinessRun[], zoneBounds: HrZoneBounds[] | null): number | null {
    if (zoneBounds === null) return null
    let easyS = 0
    let totalS = 0
    for (const run of runs) {
        for (const [bpm, timeS] of run.hrHistogram?.bins ?? []) {
            totalS += timeS
            if (zoneOfHeartRate(bpm, zoneBounds) <= 2) easyS += timeS
        }
    }
    return totalS > 0 ? easyS / totalS : null
}

// Seconds in bins that sit entirely faster than the race pace.
const fastSeconds = (histogram: PaceHistogram, racePace: number) =>
    histogram.bins.reduce(
        (sum, [pace, timeS]) => (pace + PACE_BIN_S <= racePace ? sum + timeS : sum),
        0
    )

// During the taper both verdicts turn neutral, whatever the numbers say.
const withTaper = (state: ReadinessState, taper: boolean): ReadinessState =>
    taper && (state === 'on_track' || state === 'attention') ? 'taper' : state

// Judges the load and the pace work of the last 28 days against the race. Null without a race or
// a race pace.
export function buildRaceReadiness({
    runs,
    today,
    zoneBounds,
    race,
}: Input): RunReadinessDTO | null {
    if (race === null) return null
    const racePace = racePaceSPerKm(race)
    if (racePace === null) return null

    const daysLeft = Math.round(
        (parseIsoDate(race.raceDate).getTime() - parseIsoDate(today).getTime()) / DAY_MS
    )
    const taper = daysLeft <= RACE_READINESS.TAPER_DAYS

    const windowFrom = addDays(today, -(WINDOW - 1))
    const windowRuns = runs.filter((run) => run.localDate >= windowFrom && run.localDate <= today)

    const windowKm = kmIn(runs, windowFrom, today)
    const previousKm = kmIn(runs, addDays(today, -(WINDOW * 2 - 1)), addDays(today, -WINDOW))
    const acuteKm = kmIn(runs, addDays(today, -6), today)
    const chronicKm = kmIn(runs, addDays(today, -34), addDays(today, -7)) / 4
    const ratio = chronicKm > 0 ? acuteKm / chronicKm : null
    const share = easyShare(windowRuns, zoneBounds)

    let loadState: ReadinessState = 'no_data'
    if (windowKm > 0) {
        const ratioOff =
            ratio !== null && (ratio < RACE_READINESS.RATIO_MIN || ratio > RACE_READINESS.RATIO_MAX)
        const shareOff = share !== null && share < RACE_READINESS.EASY_SHARE_MIN
        loadState = withTaper(ratioOff || shareOff ? 'attention' : 'on_track', taper)
    }

    const withPace = windowRuns.filter((run) => run.paceHistogram !== null)
    const fastTimes = withPace.map((run) => fastSeconds(run.paceHistogram!, racePace))
    const fastSessions = fastTimes.filter((timeS) => timeS >= RACE_READINESS.MIN_FAST_S).length
    const paceState: ReadinessState =
        withPace.length === 0
            ? 'no_data'
            : withTaper(
                  fastSessions >= RACE_READINESS.FAST_SESSIONS_TARGET ? 'on_track' : 'attention',
                  taper
              )

    return {
        race: {
            raceId: race.id,
            name: race.name,
            raceType: race.raceType,
            raceDate: race.raceDate,
            daysLeft,
            targetTimeS: race.targetTimeS,
            priority: race.priority,
            racePaceSPerKm: racePace,
        },
        load: {
            state: loadState,
            weeklyKm: windowKm / 4,
            previousWeeklyKm: previousKm > 0 ? previousKm / 4 : null,
            ratio,
            easySharePct: share === null ? null : Math.round(share * 100),
        },
        pace: {
            state: paceState,
            fastSessions,
            fastTimeS: Math.round(fastTimes.reduce((sum, timeS) => sum + timeS, 0)),
        },
    }
}
