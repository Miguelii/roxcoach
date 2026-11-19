import { HYROX_STATIONS, type HyroxStation } from '@/_bff/core/constants/hyrox.constants'
import { formatDuration } from '@/_bff/core/utils/formatters.utils'
import { addDays } from '@/modules/calendar/date-utils'
import { computeLoadRatio, computeTotals, loadLabel } from '@/modules/calendar/week-stats'
import { CALENDAR_ITEMS } from '@/modules/mock/data'
import type { MockActivity } from '@/modules/mock/types'

type FollowUpStatus = 'resolved' | 'open' | 'worse'

type FollowUp = {
    topic: string
    status: FollowUpStatus
    note: string
}

type RaceOutlook = {
    raceId: string
    name: string
    note: string
}

type ReportContent = {
    id: string
    weekStart: string
    headline: string
    wentWell: string[]
    watchOut: string[]
    followUps: FollowUp[]
    nextWeekFocus: string
    raceOutlook: RaceOutlook[]
    goalCheck: string | null
    memoryIds: string[]
}

type ReportMetrics = {
    time: string
    sessions: string
    runKm: string
    load: string
}

type Lap = {
    index: number
    distanceM: number
    timeS: number
    avgHr: number
    station: HyroxStation | null
}

export type WeeklyReport = ReportContent & {
    weekEnd: string
    generatedOn: string
    summary: string
    metrics: ReportMetrics
}

const MEMORY_LIMIT = 3

const computeMetrics = (weekStart: string): ReportMetrics => {
    const weekEnd = addDays(weekStart, 6)
    const totals = computeTotals(CALENDAR_ITEMS, weekStart, weekEnd)

    return {
        time: `${formatDuration(totals.doneMinutes * 60)} of ${formatDuration(totals.plannedMinutes * 60)}`,
        sessions: `${totals.doneSessions} of ${totals.totalSessions}`,
        runKm: `${totals.runKm.toFixed(1)} km`,
        load: loadLabel(computeLoadRatio(CALENDAR_ITEMS, weekEnd)) ?? 'No history yet',
    }
}

const REPORT_CONTENT: ReportContent[] = [
    {
        id: 'report-w44',
        weekStart: '2026-10-26',
        headline: 'A clean start to the block: volume landed exactly where the plan wanted it.',
        wentWell: [
            'Every planned session was completed, including the long run.',
            'Easy runs averaged 143 bpm, well inside the target zone.',
        ],
        watchOut: ['The long run slowed about 5 percent over the last 20 minutes.'],
        followUps: [],
        nextWeekFocus: 'Keep easy runs honestly easy and start fuelling earlier on the long run.',
        raceOutlook: [
            {
                raceId: 'race-silvestre',
                name: 'S. Silvestre Guimaraes 10k',
                note: 'Six weeks out. Goal pace of 4:00 /km is in range, quality work starts next week.',
            },
            {
                raceId: 'race-hyrox-lisbon',
                name: 'Hyrox Lisbon',
                note: 'Nineteen weeks out. Base phase, no station-specific load yet.',
            },
        ],
        goalCheck: null,
        memoryIds: [],
    },
    {
        id: 'report-w45',
        weekStart: '2026-11-02',
        headline: 'Consistent week with one skipped strength session.',
        wentWell: [
            'Hyrox class held at the same effort with a steadier second half.',
            'Intervals were completed with even splits.',
        ],
        watchOut: ['Friday strength was skipped. It feeds the sled work later in the block.'],
        followUps: [
            {
                topic: 'Easy runs under 150 bpm',
                status: 'resolved',
                note: 'Both easy runs averaged 143 bpm.',
            },
            {
                topic: 'Long run fade',
                status: 'open',
                note: 'Pace still dropped late in the run, a little less than the week before.',
            },
        ],
        nextWeekFocus:
            'Protect Friday strength and keep the long run steady until the last 15 minutes.',
        raceOutlook: [
            {
                raceId: 'race-silvestre',
                name: 'S. Silvestre Guimaraes 10k',
                note: 'Five weeks out. Intervals at 3:55 /km are the key session each Thursday.',
            },
            {
                raceId: 'race-hyrox-lisbon',
                name: 'Hyrox Lisbon',
                note: 'Eighteen weeks out. Still base work, strength is the lever.',
            },
        ],
        goalCheck: null,
        memoryIds: ['report-w44'],
    },
    {
        id: 'report-w46',
        weekStart: '2026-11-09',
        headline: 'The strongest week of the block, with one weekday run missed.',
        wentWell: [
            'Friday strength was done in full, closing last week’s gap.',
            'Thursday intervals averaged faster than the previous two weeks.',
            'Long run finished with the last 15 minutes at 5:00 /km as planned.',
        ],
        watchOut: [
            'The Wednesday easy run was missed. Two weekday misses in three weeks is a pattern to watch.',
        ],
        followUps: [
            {
                topic: 'Skipped Friday strength',
                status: 'resolved',
                note: 'Done on Friday, 44 minutes.',
            },
            {
                topic: 'Long run fade',
                status: 'open',
                note: 'Smaller than before, but still visible in the final 10 minutes.',
            },
            {
                topic: 'Easy runs under 150 bpm',
                status: 'resolved',
                note: 'No concerns this week.',
            },
        ],
        nextWeekFocus:
            'Hold race-pace intervals at 3:55 /km on Thursday and fuel before Saturday’s long run.',
        raceOutlook: [
            {
                raceId: 'race-parkrun',
                name: 'Parkrun Monsanto 5k',
                note: 'Four weeks out. Treat it as a hard training session, no taper.',
            },
            {
                raceId: 'race-silvestre',
                name: 'S. Silvestre Guimaraes 10k',
                note: 'Seven weeks out. On track for 39:59 if intervals keep improving.',
            },
            {
                raceId: 'race-hyrox-lisbon',
                name: 'Hyrox Lisbon',
                note: 'Seventeen weeks out. After the 10k the block turns to compromised running and sleds.',
            },
        ],
        goalCheck:
            'Your 1:10:00 Hyrox goal needs a 4:55 /km average on the runs. Recent intervals suggest 5:05 /km is realistic today. The plan builds toward the goal and will flag it again in January.',
        memoryIds: ['report-w45', 'report-w44'],
    },
]

/** Placeholder reports for the mockup. The real ones come from the model (see specs/coach.md). */
export const REPORTS: WeeklyReport[] = REPORT_CONTENT.map((report) => {
    const metrics = computeMetrics(report.weekStart)

    return {
        ...report,
        weekEnd: addDays(report.weekStart, 6),
        generatedOn: addDays(report.weekStart, 6),
        metrics,
        summary: `${metrics.sessions} planned sessions done, ${metrics.time} of the planned time and ${metrics.runKm} of running. Load finished ${metrics.load.toLowerCase()}.`,
    }
}).toSorted((a, b) => b.weekStart.localeCompare(a.weekStart))

export const LATEST_REPORT = REPORTS[0]

/** The previous reports the next one will remember, newest first, at most three. */
export const MEMORY_REPORTS = REPORTS.slice(0, MEMORY_LIMIT)

export const NEXT_REPORT_DATE = '2026-11-22'

/** Laps for the activity detail table. Hyrox gets the 16 run and station laps. */
export const getLaps = (activity: MockActivity): Lap[] => {
    if (activity.category === 'hyrox') {
        return HYROX_STATIONS.flatMap(({ key }, stationIndex): Lap[] => [
            {
                index: stationIndex * 2 + 1,
                distanceM: 1000,
                timeS: 292 + stationIndex * 3,
                avgHr: 150 + stationIndex * 2,
                station: null,
            },
            {
                index: stationIndex * 2 + 2,
                distanceM: 0,
                timeS: 150 + ((stationIndex * 41) % 90),
                avgHr: 165 + (stationIndex % 3),
                station: key,
            },
        ])
    }

    if (activity.category === 'run' && activity.distanceM) {
        const laps = Math.floor(activity.distanceM / 1000)
        const averagePace = activity.durationS / (activity.distanceM / 1000)

        return Array.from({ length: laps }, (_, index) => ({
            index: index + 1,
            distanceM: 1000,
            timeS: Math.round(averagePace * (0.97 + (index / laps) * 0.06)),
            avgHr: (activity.avgHr ?? 145) - 4 + Math.round((index / laps) * 8),
            station: null,
        }))
    }

    return []
}
