import { z } from 'zod'
import {
    MAX_HR_BPM,
    MAX_SAMPLE_GAP_S,
    MIN_HR_BPM,
    MIN_MOVING_SPEED_MPS,
} from '@/_bff/core/constants/progress.constants'
import type { HrBin, HrHistogram, HrSample } from '@/_bff/modules/training/types/progress'

const hrHistogramSchema = z.object({
    v: z.literal(1),
    bins: z.array(z.tuple([z.number(), z.number(), z.number()])),
})

// Distance of an interval: cumulative delta when both points have it, else the later point speed.
// Returns null when no speed is known.
function intervalDistance(prev: HrSample, cur: HrSample, dtS: number): number | null {
    if (prev.distanceM !== null && cur.distanceM !== null) {
        return Math.max(0, cur.distanceM - prev.distanceM)
    }
    if (cur.speedMps !== null) return Math.max(0, cur.speedMps * dtS)
    return null
}

// Builds a per-bpm histogram of moving time and distance, each interval taking the later point hr.
export function buildHrHistogram(samples: HrSample[]): HrHistogram {
    const acc = new Map<number, { timeS: number; distanceM: number }>()
    for (let i = 1; i < samples.length; i++) {
        const prev = samples[i - 1]
        const cur = samples[i]
        const dtS = (cur.t - prev.t) / 1000
        if (!(dtS > 0) || dtS > MAX_SAMPLE_GAP_S) continue
        const hr = cur.hr
        if (hr === null || !Number.isFinite(hr) || hr < MIN_HR_BPM || hr > MAX_HR_BPM) continue
        const distanceM = intervalDistance(prev, cur, dtS)
        if (distanceM === null || distanceM / dtS < MIN_MOVING_SPEED_MPS) continue
        const bpm = Math.round(hr)
        const entry = acc.get(bpm) ?? { timeS: 0, distanceM: 0 }
        entry.timeS += dtS
        entry.distanceM += distanceM
        acc.set(bpm, entry)
    }
    const bins = [...acc.entries()]
        .sort(([a], [b]) => a - b)
        .map(([bpm, e]): HrBin => [bpm, Math.round(e.timeS * 10) / 10, Math.round(e.distanceM)])
    return { v: 1, bins }
}

// Validates a stored histogram (version 1 only); null means "not computed".
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parsed by the zod schema right below
export function parseHrHistogram(value: unknown): HrHistogram | null {
    const result = hrHistogramSchema.safeParse(value)
    return result.success ? result.data : null
}
