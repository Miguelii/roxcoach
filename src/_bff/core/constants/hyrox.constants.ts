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
const HYROX_STATION_ORDER: HyroxStation[] = [
    'ski_erg',
    'sled_push',
    'sled_pull',
    'burpee_broad_jump',
    'rowing',
    'farmers_carry',
    'sandbag_lunges',
    'wall_balls',
]

export const HYROX_STATIONS = HYROX_STATION_ORDER.map((key) => ({
    key,
    label: HYROX_STATION_LABELS[key],
}))
