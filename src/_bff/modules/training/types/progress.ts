// `t` is epoch ms, `distanceM` is cumulative distance in meters.
export type HrSample = {
    t: number
    hr: number | null
    distanceM: number | null
    speedMps: number | null
}

// [bpm, timeS, distanceM]
export type HrBin = [bpm: number, timeS: number, distanceM: number]

export type HrHistogram = { v: 1; bins: HrBin[] }
