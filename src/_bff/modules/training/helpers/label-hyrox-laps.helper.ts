import { HYROX_STATION_ORDER, type HyroxStation } from '@/_bff/core/constants/hyrox.constants'
import type { ParsedLap } from '@/_bff/modules/training/types'

const HYROX_LAP_COUNT = 16

// Heuristic by lap order: the Zepp export carries no station names. A full Hyrox
// race has 16 laps (run, station) x 8, so even indices are runs (null) and odd
// indices are the stations in race order. Any other lap count returns null.
export function labelHyroxLaps(laps: ParsedLap[]): Array<HyroxStation | null> | null {
    if (laps.length !== HYROX_LAP_COUNT) return null
    return laps.map((_, index) =>
        index % 2 === 0 ? null : (HYROX_STATION_ORDER[(index - 1) / 2] ?? null)
    )
}
