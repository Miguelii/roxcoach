import type { ParsedLap } from '@/_bff/modules/training/types'
import type { ZeppRunDetail, ZeppRunSummary } from '@/_bff/modules/zepp/types'
import { decodeDeltaSeries } from '@/_bff/modules/zepp/utils/series.utils'

type KiloSplit = { movingS: number; avgHr: number | null; endOffsetS: number }

const KILOMETRE_M = 1000
// A last partial kilometre shorter than this is GPS noise after the watch stopped, not a split.
const MIN_PARTIAL_M = 10

// `kilo_pace` has one entry per full kilometre. Checked against the samples of the mock run: the
// 5th value is the average heart rate, the 6th the offset from the track id at the end of the
// kilometre and the 7th the moving time in milliseconds. The other values are not used.
function decodeKiloPace(raw: string): KiloSplit[] {
    const splits: KiloSplit[] = []
    for (const entry of raw.split(';')) {
        const values = entry.split(',').map(Number)
        const avgHr = values[4]
        const endOffsetS = values[5]
        const movingMs = values[6]
        if (
            avgHr === undefined ||
            endOffsetS === undefined ||
            movingMs === undefined ||
            !Number.isFinite(avgHr) ||
            !Number.isFinite(endOffsetS) ||
            !Number.isFinite(movingMs) ||
            movingMs <= 0
        )
            continue
        splits.push({ movingS: movingMs / 1000, avgHr: avgHr > 0 ? avgHr : null, endOffsetS })
    }
    return splits
}

function averageHrBetween(heartRate: string, fromS: number, toS: number) {
    const rates = decodeDeltaSeries(heartRate).flatMap((point) =>
        point.offsetS > fromS && point.offsetS <= toS && point.value > 0 ? [point.value] : []
    )
    if (rates.length === 0) return null
    return Math.round(rates.reduce((total, rate) => total + rate, 0) / rates.length)
}

// One lap per full kilometre, then the partial last one from what the summary has left. Without
// kilometre splits the whole run is one lap, so the run never looks unsplit to the next sync.
export function buildZeppLaps(summary: ZeppRunSummary, detail: ZeppRunDetail): ParsedLap[] {
    const trackS = Number(summary.trackId)
    const elapsedS = summary.endTimeS - trackS
    const lapAt = (startOffsetS: number) => new Date((trackS + startOffsetS) * 1000).toISOString()
    const splits = decodeKiloPace(detail.kiloPace)

    if (splits.length === 0)
        return [
            {
                lapIndex: 1,
                name: null,
                startedAt: lapAt(0),
                elapsedTimeS: elapsedS,
                movingTimeS: summary.movingTimeS,
                distanceM: summary.distanceM,
                avgHr: summary.avgHrBpm === null ? null : Math.round(summary.avgHrBpm),
                avgSpeedMps:
                    summary.movingTimeS > 0 ? summary.distanceM / summary.movingTimeS : null,
                calories: null,
            },
        ]

    const laps = splits.map((split, index): ParsedLap => {
        const startOffsetS = splits[index - 1]?.endOffsetS ?? 0
        return {
            lapIndex: index + 1,
            name: null,
            startedAt: lapAt(startOffsetS),
            elapsedTimeS: split.endOffsetS - startOffsetS,
            movingTimeS: Math.round(split.movingS),
            distanceM: KILOMETRE_M,
            avgHr: split.avgHr,
            avgSpeedMps: KILOMETRE_M / split.movingS,
            calories: null,
        }
    })

    const lastEndS = splits.at(-1)?.endOffsetS ?? 0
    const partialM = summary.distanceM - splits.length * KILOMETRE_M
    const partialMovingS =
        summary.movingTimeS - splits.reduce((total, split) => total + split.movingS, 0)
    if (partialM >= MIN_PARTIAL_M && partialMovingS > 0)
        laps.push({
            lapIndex: splits.length + 1,
            name: null,
            startedAt: lapAt(lastEndS),
            elapsedTimeS: Math.max(0, elapsedS - lastEndS),
            movingTimeS: Math.round(partialMovingS),
            distanceM: partialM,
            avgHr: averageHrBetween(detail.heartRate, lastEndS, elapsedS),
            avgSpeedMps: partialM / partialMovingS,
            calories: null,
        })
    return laps
}
