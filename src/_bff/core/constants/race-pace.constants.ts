type PaceTier = { goalS: number; paceSPerKm: number }

// Run pace (seconds per km) of a Hyrox by goal finish time: sub 60, 75, 90 and 105 minutes.
export const HYROX_RUN_PACE_TIERS: readonly PaceTier[] = [
    { goalS: 3600, paceSPerKm: 238 },
    { goalS: 4500, paceSPerKm: 295 },
    { goalS: 5400, paceSPerKm: 355 },
    { goalS: 6300, paceSPerKm: 413 },
]
