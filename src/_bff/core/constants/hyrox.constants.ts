export type HyroxStation =
    | 'ski_erg'
    | 'sled_push'
    | 'sled_pull'
    | 'burpee_broad_jump'
    | 'rowing'
    | 'farmers_carry'
    | 'sandbag_lunges'
    | 'wall_balls'

export const HYROX_STATION_LABELS: Record<HyroxStation, string> = {
    ski_erg: 'SkiErg',
    sled_push: 'Sled Push',
    sled_pull: 'Sled Pull',
    burpee_broad_jump: 'Burpee Broad Jumps',
    rowing: 'Rowing',
    farmers_carry: 'Farmers Carry',
    sandbag_lunges: 'Sandbag Lunges',
    wall_balls: 'Wall Balls',
}

/** Stations in race order, each following one 1 km run. */
export const HYROX_STATION_ORDER: HyroxStation[] = [
    'ski_erg',
    'sled_push',
    'sled_pull',
    'burpee_broad_jump',
    'rowing',
    'farmers_carry',
    'sandbag_lunges',
    'wall_balls',
]

export const HYROX_DIVISION_KEYS = [
    'open_men',
    'open_women',
    'pro_men',
    'pro_women',
    'doubles_men',
    'doubles_women',
    'doubles_mixed',
] as const

export type HyroxDivision = (typeof HYROX_DIVISION_KEYS)[number]

const HYROX_DIVISION_LABELS: Record<HyroxDivision, string> = {
    open_men: 'Open Men',
    open_women: 'Open Women',
    pro_men: 'Pro Men',
    pro_women: 'Pro Women',
    doubles_men: 'Doubles Men',
    doubles_women: 'Doubles Women',
    doubles_mixed: 'Doubles Mixed',
}

// Check this list against the official HYROX divisions before release.
export const HYROX_DIVISIONS: ReadonlyArray<{ key: HyroxDivision; label: string }> =
    HYROX_DIVISION_KEYS.map((key) => ({ key, label: HYROX_DIVISION_LABELS[key] }))
