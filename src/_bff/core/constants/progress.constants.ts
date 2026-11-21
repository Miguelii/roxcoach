// Largest time step (seconds) between two samples that still counts as continuous movement.
export const MAX_SAMPLE_GAP_S = 10
// Below this speed (m/s) the athlete is considered stopped.
export const MIN_MOVING_SPEED_MPS = 0.5
export const MIN_HR_BPM = 30
export const MAX_HR_BPM = 250

export const PROGRESS_RANGES = ['3m', '6m', '12m'] as const
export type ProgressRange = (typeof PROGRESS_RANGES)[number]
// Minimum time in a zone for a bucket to report a pace for it.
export const DEFAULT_PROGRESS_RANGE: ProgressRange = '6m'

export const MIN_ZONE_SAMPLE_S = 300
export const TOP_EXERCISES = 5
// Epley is only trusted for sets up to this many reps.
export const ONE_RM_MAX_REPS = 12
