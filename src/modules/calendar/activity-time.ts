import type { ActivityDTO } from '@/_bff/modules/training/types'

/** Moving time in seconds, falling back to elapsed time, or null when neither is known. */
export const activityDurationS = (activity: ActivityDTO) =>
    activity.movingTimeS ?? activity.elapsedTimeS
