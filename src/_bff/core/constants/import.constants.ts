// The watch starts a workout a few minutes before the first sample, and a file exported from
// the same watch starts at a slightly different instant, so two starts this close are one workout.
export const DUPLICATE_WINDOW_SECONDS = 300
