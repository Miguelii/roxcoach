// Thresholds of the race readiness card. The window is the last WINDOW_DAYS days ending today.
export const RACE_READINESS = {
    WINDOW_DAYS: 28,
    // Acute (last 7 days) to chronic (weekly average of the 28 days before) run distance ratio.
    RATIO_MIN: 0.8,
    RATIO_MAX: 1.3,
    // Share of the run time spent in Z1 and Z2.
    EASY_SHARE_MIN: 0.7,
    // A fast session has at least this many seconds at a pace faster than the race pace.
    MIN_FAST_S: 180,
    FAST_SESSIONS_TARGET: 3,
    // From this many days before the race the verdicts become neutral.
    TAPER_DAYS: 7,
} as const
