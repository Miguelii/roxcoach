// Largest time step (seconds) between two samples that still counts as continuous movement.
export const MAX_SAMPLE_GAP_S = 10
// Below this speed (m/s) the athlete is considered stopped.
export const MIN_MOVING_SPEED_MPS = 0.5
export const MIN_HR_BPM = 30
export const MAX_HR_BPM = 250

export const PROGRESS_RANGES = ['3m', '6m', '12m'] as const
export type ProgressRange = (typeof PROGRESS_RANGES)[number]
export const DEFAULT_PROGRESS_RANGE: ProgressRange = '6m'

// Minimum time in a zone for a bucket to report a pace for it.
export const MIN_ZONE_SAMPLE_S = 300
// How many exercises the strength dashboard can choose from (the dashboard shows the top 4 by default).
export const MAX_EXERCISES = 12
