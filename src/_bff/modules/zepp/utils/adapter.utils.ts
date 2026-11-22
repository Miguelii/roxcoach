import type { HrSample } from '@/_bff/modules/training/types/progress'
import type { AdaptedActivity, ZeppRunDetail, ZeppRunSummary } from '@/_bff/modules/zepp/types'
import { buildZeppLaps } from '@/_bff/modules/zepp/utils/laps.utils'
import {
    decodeAbsoluteSeries,
    decodeDeltaSeries,
    type ZeppPoint,
} from '@/_bff/modules/zepp/utils/series.utils'

const CENTIMETRES_PER_METRE = 100

// The value of the latest point at or before the offset; `cursor` only moves forward.
function carryForward(points: ZeppPoint[], offsetS: number, cursor: { index: number }) {
    while (points[cursor.index + 1] !== undefined && points[cursor.index + 1]!.offsetS <= offsetS) {
        cursor.index += 1
    }
    const point = points[cursor.index]
    return point !== undefined && point.offsetS <= offsetS ? point.value : null
}

// The timeline is the cumulative distance series; heart rate and speed are read at each of its points.
function buildSamples(summary: ZeppRunSummary, detail: ZeppRunDetail): HrSample[] {
    const distance = decodeAbsoluteSeries(detail.distance)
    const heartRate = decodeDeltaSeries(detail.heartRate)
    const speed = decodeAbsoluteSeries(detail.speed)
    const heartCursor = { index: 0 }
    const speedCursor = { index: 0 }
    const trackMs = Number(summary.trackId) * 1000

    return distance.map((point) => ({
        t: trackMs + point.offsetS * 1000,
        hr: carryForward(heartRate, point.offsetS, heartCursor),
        distanceM: point.value / CENTIMETRES_PER_METRE,
        speedMps: carryForward(speed, point.offsetS, speedCursor),
    }))
}

export function adaptZeppRun(summary: ZeppRunSummary, detail: ZeppRunDetail): AdaptedActivity {
    const trackS = Number(summary.trackId)
    return {
        startedAt: new Date(trackS * 1000).toISOString(),
        sportType: 'running',
        category: 'run',
        name: summary.sportTitle ?? 'Run',
        distanceM: summary.distanceM,
        movingTimeS: summary.movingTimeS,
        // Includes the pauses and the lead-in the watch counts before the first sample.
        elapsedTimeS: summary.endTimeS - trackS,
        elevationGainM: null,
        avgHr: summary.avgHrBpm === null ? null : Math.round(summary.avgHrBpm),
        maxHr: summary.maxHrBpm,
        avgSpeedMps: summary.movingTimeS > 0 ? summary.distanceM / summary.movingTimeS : null,
        calories: summary.calories,
        noteText: null,
        laps: buildZeppLaps(summary, detail),
        samples: buildSamples(summary, detail),
    }
}
