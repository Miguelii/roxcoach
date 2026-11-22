// Thresholds of the race readiness card. The window is the last WINDOW_DAYS days ending today.
export const RACE_READINESS = {
    WINDOW_DAYS: 28,
    // Acute (last 7 days) to chronic (weekly average of the 28 days before) run distance ratio.
    RATIO_MIN: 0.8,
    RATIO_MAX: 1.3,
    // Share of the run time spent in Z1 and Z2.
    EASY_SHARE_MIN: 0.75,
    // A hard session has at least this many seconds at race pace or faster. GPS pace wobbles
    // around the race pace in a race-pace session (5x1 km), so bins up to this many s/km slower
    // than the race pace still count.
    MIN_FAST_S: 180,
    RACE_PACE_TOLERANCE_S: 5,
    // At least one hard session a week on average over the window, and at most two in any 7 days.
    FAST_SESSIONS_TARGET: 4,
    MAX_HARD_PER_WEEK: 2,
    // From this many days before the race the verdicts become neutral.
    TAPER_DAYS: 7,
} as const
