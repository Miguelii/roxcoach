import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { addDays } from '@/_bff/core/utils/week-dates.utils'
import { getWeeklyGoals } from '@/_bff/modules/athlete/services/get-weekly-goals.service'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import { buildCoachContext } from '@/_bff/modules/coach/helpers/build-coach-context.helper'
import { listRaces } from '@/_bff/modules/races/services/list-races.service'
import { getActivityCalendar } from '@/_bff/modules/training/services/get-activity-calendar.service'

type CoachContextDeps = {
    getWeeklyGoals: typeof getWeeklyGoals
    listRaces: typeof listRaces
    getActivityCalendar: typeof getActivityCalendar
}

// Already resolved by the caller, so the profile is read once per message.
type CoachContextBase = { profile: ProfileDTO; timezone: string; today: string }

const CONTEXT_DAYS = 35

const REAL_DEPS: CoachContextDeps = {
    getWeeklyGoals,
    listRaces,
    getActivityCalendar,
}

// Gathers the athlete data (as the signed-in user) and renders the always-sent context block.
export const getCoachContext = Effect.fn('getCoachContext')(function* (
    user: User,
    { profile, timezone, today }: CoachContextBase,
    deps: CoachContextDeps = REAL_DEPS
) {
    const [goals, races, calendar] = yield* Effect.all(
        [
            deps.getWeeklyGoals(user),
            deps.listRaces(user, { status: ['upcoming'] }),
            deps.getActivityCalendar(user, { from: addDays(today, 1 - CONTEXT_DAYS), to: today }),
        ],
        { concurrency: 3 }
    )

    const activities = calendar.flatMap((item) => (item.type === 'activity' ? [item.activity] : []))
    const context = buildCoachContext({ today, timezone, profile, goals, races, activities })

    return { context, timezone }
})
