import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { getAvailability } from '@/_bff/modules/athlete/services/get-availability.service'
import { makeGetActivitiesTool } from '@/_bff/modules/coach/tools/get-activities.tool'
import { makeGetActivityTool } from '@/_bff/modules/coach/tools/get-activity.tool'
import { makeGetAvailabilityTool } from '@/_bff/modules/coach/tools/get-availability.tool'
import { makeGetRacesTool } from '@/_bff/modules/coach/tools/get-races.tool'
import { makeGetWeeklySummaryTool } from '@/_bff/modules/coach/tools/get-weekly-summary.tool'
import type { CoachTool, CoachToolDeps } from '@/_bff/modules/coach/types'
import { listRaces } from '@/_bff/modules/races/services/list-races.service'
import { getActivity } from '@/_bff/modules/training/services/get-activity.service'
import { getCalendar } from '@/_bff/modules/training/services/get-calendar.service'

const REAL_DEPS: CoachToolDeps = {
    listRaces: (user, filter) => Effect.runPromise(listRaces(user, filter)),
    getAvailability: (user) => Effect.runPromise(getAvailability(user)),
    getCalendar: (user, range) => Effect.runPromise(getCalendar(user, range)),
    // The tool drops the comparisons, so it skips reading the history for them.
    getActivity: (user, id) => Effect.runPromise(getActivity(user, id, { withComparisons: false })),
}

/** The read-only coach tools. The user is closed over: no tool input ever carries a user id. */
export const makeCoachTools = (user: User, deps: CoachToolDeps = REAL_DEPS): CoachTool[] => [
    makeGetRacesTool(user, deps),
    makeGetAvailabilityTool(user, deps),
    makeGetActivitiesTool(user, deps),
    makeGetActivityTool(user, deps),
    makeGetWeeklySummaryTool(user, deps),
]
