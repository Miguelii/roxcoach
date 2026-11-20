import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { localDayBoundsUtc, todayIn } from '@/_bff/core/utils/date.utils'
import { countUserMessagesBetween } from '@/_bff/modules/coach/repositories/coach-messages.repository'
import { createCoachClient } from '@/_bff/modules/coach/services/coach-client.service'

// How many messages the athlete sent today, where today is the local day in `timezone`.
export const countUserMessagesToday = Effect.fn('countUserMessagesToday')(function* (
    user: User,
    timezone: string,
    now: Date = new Date()
) {
    const supabase = yield* createCoachClient()
    const { fromIso, toIso } = localDayBoundsUtc(todayIn(timezone, now), timezone)
    return yield* countUserMessagesBetween(supabase, user.id, fromIso, toIso)
})
