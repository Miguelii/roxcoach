export type ZoneNumber = 1 | 2 | 3 | 4 | 5

// `toBpm` is inclusive; Z5 has no upper bound.
export type HrZoneBounds = { zone: ZoneNumber; fromBpm: number; toBpm: number | null }

type HrZone = { zone: ZoneNumber; label: string; name: string; floorPct: number }

type ProfileHeartRates = { maxHr: number | null; restingHr: number | null }

// Karvonen floors as a share of the heart rate reserve. Z1 is everything below Z2.
const HR_ZONES: ReadonlyArray<HrZone> = [
    { zone: 1, label: 'Z1', name: 'Recovery', floorPct: 0 },
    { zone: 2, label: 'Z2', name: 'Easy', floorPct: 0.6 },
    { zone: 3, label: 'Z3', name: 'Moderate', floorPct: 0.7 },
    { zone: 4, label: 'Z4', name: 'Threshold', floorPct: 0.8 },
    { zone: 5, label: 'Z5', name: 'Maximum', floorPct: 0.9 },
]

// `bpm = resting + percent * (max - resting)`. Null when either heart rate is missing or max is
// not above resting, so callers can show an empty state instead of nonsense bounds.
export function zoneBoundsBpm({ maxHr, restingHr }: ProfileHeartRates): HrZoneBounds[] | null {
    if (maxHr === null || restingHr === null || maxHr <= restingHr) return null
    const reserve = maxHr - restingHr
    const floors = HR_ZONES.map((z) =>
        z.zone === 1 ? 0 : Math.round(restingHr + z.floorPct * reserve)
    )
    return HR_ZONES.map((z, index) => {
        const next = floors[index + 1]
        return {
            zone: z.zone,
            fromBpm: floors[index] ?? 0,
            toBpm: next === undefined ? null : next - 1,
        }
    })
}

// The last zone whose floor is at or below the heart rate, so values above the stored max are Z5.
export function zoneOfHeartRate(bpm: number, bounds: HrZoneBounds[]): ZoneNumber {
    let zone: ZoneNumber = 1
    for (const bound of bounds) if (bpm >= bound.fromBpm) zone = bound.zone
    return zone
}
