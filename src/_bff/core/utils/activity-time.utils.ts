type ActivityDuration = { movingTimeS: number | null; elapsedTimeS: number | null }

/** Moving time in seconds, falling back to elapsed time, or null when neither is known. */
export const activityDurationS = (activity: ActivityDuration) =>
    activity.movingTimeS ?? activity.elapsedTimeS
