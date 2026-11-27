import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { makeGetActivitiesTool } from '@/_bff/modules/coach/tools/get-activities.tool'
import { makeGetActivityTool } from '@/_bff/modules/coach/tools/get-activity.tool'
import { makeGetRacesTool } from '@/_bff/modules/coach/tools/get-races.tool'
import { makeGetWeeklySummaryTool } from '@/_bff/modules/coach/tools/get-weekly-summary.tool'
import type { CoachTool, CoachToolDeps } from '@/_bff/modules/coach/types'
import { listRaces } from '@/_bff/modules/races/services/list-races.service'
import { getActivity } from '@/_bff/modules/training/services/get-activity.service'
import { getActivityCalendar } from '@/_bff/modules/training/services/get-activity-calendar.service'

const REAL_DEPS: CoachToolDeps = {
    listRaces: (user, filter) => Effect.runPromise(listRaces(user, filter)),
    getActivityCalendar: (user, range) => Effect.runPromise(getActivityCalendar(user, range)),
    // The tool drops the comparisons, so it skips reading the history for them.
    getActivity: (user, id) => Effect.runPromise(getActivity(user, id, { withComparisons: false })),
}

/** The read-only coach tools. The user is closed over: no tool input ever carries a user id. */
export const makeCoachTools = (user: User, deps: CoachToolDeps = REAL_DEPS): CoachTool[] => [
    makeGetRacesTool(user, deps),
    makeGetActivitiesTool(user, deps),
    makeGetActivityTool(user, deps),
    makeGetWeeklySummaryTool(user, deps),
]
