export type ZeppPoint = { offsetS: number; value: number }

// Every entry is `dt,value`: dt is the seconds since the previous entry, so the running sum of dt
// is the offset from the track id.
function decode(raw: string, accumulateValue: boolean): ZeppPoint[] {
    const points: ZeppPoint[] = []
    let offsetS = 0
    let running = 0
    for (const entry of raw.split(';')) {
        const [dt, value] = entry.split(',').map(Number)
        if (
            dt === undefined ||
            value === undefined ||
            !Number.isFinite(dt) ||
            !Number.isFinite(value)
        )
            continue
        offsetS += dt
        running = accumulateValue ? running + value : value
        points.push({ offsetS, value: running })
    }
    return points
}

// Heart rate: the first value is absolute and the rest are changes to the previous one.
export const decodeDeltaSeries = (raw: string) => decode(raw, true)

// Distance (cumulative centimetres) and speed (metres per second): every value is absolute.
export const decodeAbsoluteSeries = (raw: string) => decode(raw, false)
