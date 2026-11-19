import { HYROX_STATIONS, type HyroxStation } from '@/_bff/core/constants/hyrox.constants'

type StationPattern = { station: HyroxStation; pattern: RegExp }

const HYROX_LAP_COUNT = 16

// Word boundaries keep "row" from matching "arrow" or "tomorrow".
const NAME_PATTERNS: StationPattern[] = [
    { station: 'ski_erg', pattern: /\bski\s?erg\b/iu },
    { station: 'sled_push', pattern: /\bsled\s+push/iu },
    { station: 'sled_pull', pattern: /\bsled\s+pull/iu },
    { station: 'burpee_broad_jump', pattern: /\bburpee/iu },
    { station: 'rowing', pattern: /\brow(ing)?\b/iu },
    { station: 'farmers_carry', pattern: /\bfarmer'?s?\b/iu },
    { station: 'sandbag_lunges', pattern: /\blunge/iu },
    { station: 'wall_balls', pattern: /\bwall\s?balls?\b/iu },
]

// A name that matches two stations is ambiguous, so it stays untagged.
const stationFromName = (name: string | null | undefined): HyroxStation | null => {
    if (!name) return null
    const matches = NAME_PATTERNS.filter(({ pattern }) => pattern.test(name))
    return matches.length === 1 ? (matches[0]?.station ?? null) : null
}

// Laps 1, 3, 5... (indexes 0, 2, 4...) are runs, the laps in between are the 8 stations in order.
const stationFromPosition = (index: number): HyroxStation | null =>
    index % 2 === 1 ? (HYROX_STATIONS[(index - 1) / 2]?.key ?? null) : null

// Conservative: names win when any lap carries a station name, a bare 16 lap list is tagged by
// position, anything else stays untagged. A wrong tag is worse than none.
export const detectHyroxStations = (
    laps: Array<{ name?: string | null }>
): Array<HyroxStation | null> => {
    const fromNames = laps.map((lap) => stationFromName(lap.name))
    if (fromNames.some((station) => station !== null)) return fromNames
    if (laps.length === HYROX_LAP_COUNT) return laps.map((_, index) => stationFromPosition(index))
    return fromNames
}
