import type { LapDTO } from '@/_bff/modules/training/types'

export type RunSplit = {
    lapIndex: number
    distanceM: number
    // Cumulative distance at the start of the split, in meters.
    startM: number
    paceSPerKm: number
    avgHr: number | null
}

export type ChartPoint = { x: number; y: number }

// Splits that count for a run: not a Hyrox station, with a distance and a derivable pace.
export function toRunSplits(laps: LapDTO[]): RunSplit[] {
    const splits: RunSplit[] = []
    let startM = 0
    for (const lap of laps) {
        if (lap.station !== null || !lap.distanceM || lap.distanceM <= 0) continue
        const timeS = lap.movingTimeS ?? lap.elapsedTimeS
        const speed = lap.avgSpeedMps ?? (timeS ? lap.distanceM / timeS : null)
        if (!speed || speed <= 0) continue
        splits.push({
            lapIndex: lap.lapIndex,
            distanceM: lap.distanceM,
            startM,
            paceSPerKm: 1000 / speed,
            avgHr: lap.avgHr,
        })
        startM += lap.distanceM
    }
    return splits
}

// Bar length as a share of the row: the fastest split fills it, the slowest keeps a stub.
export function barShare(paceSPerKm: number, fastest: number, slowest: number): number {
    if (slowest <= fastest) return 100
    return 28 + (72 * (slowest - paceSPerKm)) / (slowest - fastest)
}

// One point per split at its midpoint, anchored to both ends so the area spans the full distance.
export function toChartPoints(
    splits: RunSplit[],
    pick: (split: RunSplit) => number | null
): ChartPoint[] {
    const mids = splits.flatMap((split) => {
        const y = pick(split)
        return y === null ? [] : [{ x: (split.startM + split.distanceM / 2) / 1000, y }]
    })
    const first = mids[0]
    const last = mids.at(-1)
    if (!first || !last) return []
    const last_split = splits.at(-1)
    const totalKm = last_split ? (last_split.startM + last_split.distanceM) / 1000 : last.x
    return [{ x: 0, y: first.y }, ...mids, { x: totalKm, y: last.y }]
}

// Monotone cubic (Fritsch-Carlson) so the curve never overshoots the data between points.
export function smoothPath(points: { x: number; y: number }[]): string {
    const n = points.length
    const first = points[0]
    if (!first) return ''
    if (n < 2) return `M${first.x},${first.y}`

    const dx: number[] = []
    const slope: number[] = []
    for (let i = 0; i < n - 1; i++) {
        const a = points[i]!
        const b = points[i + 1]!
        dx.push(b.x - a.x)
        const run = dx[i] ?? 0
        slope.push(run === 0 ? 0 : (b.y - a.y) / run)
    }
    const tangent: number[] = [slope[0]!]
    for (let i = 1; i < n - 1; i++) {
        const s0 = slope[i - 1]!
        const s1 = slope[i]!
        tangent.push(s0 * s1 <= 0 ? 0 : (s0 + s1) / 2)
    }
    tangent.push(slope[n - 2]!)
    for (let i = 0; i < n - 1; i++) {
        const s = slope[i]!
        if (s === 0) {
            tangent[i] = 0
            tangent[i + 1] = 0
            continue
        }
        const a = tangent[i]! / s
        const b = tangent[i + 1]! / s
        const h = Math.hypot(a, b)
        if (h > 3) {
            tangent[i] = (3 * a * s) / h
            tangent[i + 1] = (3 * b * s) / h
        }
    }

    let path = `M${first.x},${first.y}`
    for (let i = 0; i < n - 1; i++) {
        const a = points[i]!
        const b = points[i + 1]!
        const step = dx[i]! / 3
        path += `C${a.x + step},${a.y + tangent[i]! * step},${b.x - step},${b.y - tangent[i + 1]! * step},${b.x},${b.y}`
    }
    return path
}

// Evenly spaced ticks from `min` up to `max`, both snapped outward to `step`.
export function niceTicks(min: number, max: number, step: number): number[] {
    const from = Math.floor(min / step) * step
    const to = Math.ceil(max / step) * step
    const ticks: number[] = []
    for (let value = from; value <= to + 1e-6; value += step) ticks.push(value)
    return ticks
}

// Distance gridlines: every 1, 2 or 5 km depending on how long the run is.
export function kmTicks(totalKm: number): number[] {
    const step = totalKm <= 6 ? 1 : totalKm <= 14 ? 2 : 5
    const ticks: number[] = []
    for (let km = step; km <= totalKm + 1e-6; km += step) ticks.push(km)
    return ticks
}
