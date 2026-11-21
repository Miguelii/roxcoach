import { z } from 'zod'
import {
    MAX_PACE_S_PER_KM,
    MAX_SAMPLE_GAP_S,
    MIN_MOVING_SPEED_MPS,
    MIN_PACE_S_PER_KM,
    PACE_BIN_S,
} from '@/_bff/core/constants/progress.constants'
import type { HrSample, PaceBin, PaceHistogram } from '@/_bff/modules/training/types/progress'

const paceHistogramSchema = z.object({
    v: z.literal(1),
    bins: z.array(z.tuple([z.number(), z.number(), z.number()])),
})

// Distance of an interval: cumulative delta when both points have it, else the later point speed.
function intervalDistance(prev: HrSample, cur: HrSample, dtS: number): number | null {
    if (prev.distanceM !== null && cur.distanceM !== null) {
        return Math.max(0, cur.distanceM - prev.distanceM)
    }
    if (cur.speedMps !== null) return Math.max(0, cur.speedMps * dtS)
    return null
}

// Builds a histogram of moving time and distance per pace bin. Heart rate is not needed, so it
// works for any run with distance or speed. Each interval takes the pace of its own time step.
export function buildPaceHistogram(samples: HrSample[]): PaceHistogram {
    const acc = new Map<number, { timeS: number; distanceM: number }>()
    for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1]!
        const cur = samples[i]!
        const dtS = (cur.t - prev.t) / 1000
        if (!(dtS > 0) || dtS > MAX_SAMPLE_GAP_S) continue
        const distanceM = intervalDistance(prev, cur, dtS)
        if (distanceM === null || distanceM / dtS < MIN_MOVING_SPEED_MPS) continue
        const pace = dtS / (distanceM / 1000)
        const clamped = Math.min(Math.max(pace, MIN_PACE_S_PER_KM), MAX_PACE_S_PER_KM)
        const bin = Math.floor(clamped / PACE_BIN_S) * PACE_BIN_S
        const entry = acc.get(bin) ?? { timeS: 0, distanceM: 0 }
        entry.timeS += dtS
        entry.distanceM += distanceM
        acc.set(bin, entry)
    }
    const bins = [...acc.entries()]
        .sort(([a], [b]) => a - b)
        .map(([pace, e]): PaceBin => [pace, Math.round(e.timeS * 10) / 10, Math.round(e.distanceM)])
    return { v: 1, bins }
}

// Validates a stored histogram (version 1 only); null means "not computed".
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parsed by the zod schema right below
export function parsePaceHistogram(value: unknown): PaceHistogram | null {
    const result = paceHistogramSchema.safeParse(value)
    return result.success ? result.data : null
}
