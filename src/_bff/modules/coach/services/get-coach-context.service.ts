import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { addDays } from '@/_bff/core/utils/week-dates.utils'
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import { getAvailability } from '@/_bff/modules/athlete/services/get-availability.service'
import { getProfile } from '@/_bff/modules/athlete/services/get-profile.service'
import { buildCoachContext } from '@/_bff/modules/coach/helpers/build-coach-context.helper'
import { listRaces } from '@/_bff/modules/races/services/list-races.service'
import { getCalendar } from '@/_bff/modules/training/services/get-calendar.service'

type CoachContextDeps = {
    getAthleteTimezone: typeof getAthleteTimezone
    getProfile: typeof getProfile
    getAvailability: typeof getAvailability
    listRaces: typeof listRaces
    getCalendar: typeof getCalendar
    now: () => Date
}

const CONTEXT_DAYS = 35

const REAL_DEPS: CoachContextDeps = {
    getAthleteTimezone,
    getProfile,
    getAvailability,
    listRaces,
    getCalendar,
    now: () => new Date(),
}

// Gathers the athlete data (as the signed-in user) and renders the always-sent context block.
export const getCoachContext = Effect.fn('getCoachContext')(function* (
    user: User,
    deps: CoachContextDeps = REAL_DEPS
) {
    const timezone = yield* deps.getAthleteTimezone(user)
    const today = todayIn(timezone, deps.now())

    const [profile, availability, races, calendar] = yield* Effect.all(
        [
            deps.getProfile(user),
            deps.getAvailability(user),
            deps.listRaces(user, { status: ['upcoming'] }),
            deps.getCalendar(user, { from: addDays(today, 1 - CONTEXT_DAYS), to: today }),
        ],
        { concurrency: 4 }
    )

    const activities = calendar.flatMap((item) => (item.type === 'activity' ? [item.activity] : []))
    const context = buildCoachContext({ today, timezone, profile, availability, races, activities })

    return { context, timezone }
})
