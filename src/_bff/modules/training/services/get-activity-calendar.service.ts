import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import {
    validateRange,
    type DateRange,
} from '@/_bff/modules/training/helpers/validate-calendar-range.helper'
import { selectActivitiesInRange } from '@/_bff/modules/training/repositories/activities.repository'
import type { CalendarItem } from '@/_bff/modules/training/types'

// The activities of the calendar without its races, for readers that only need the activities (the
// coach context and tools), so no races query runs. Same validation as `getCalendar`.
export const getActivityCalendar = Effect.fn('getActivityCalendar')(function* (
    user: User,
    range: DateRange
) {
    yield* validateRange(range)

    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
    })

    const activities = yield* selectActivitiesInRange(supabase, user.id, range.from, range.to)

    return activities.map((activity): CalendarItem => ({
        type: 'activity',
        date: activity.localDate,
        activity,
    }))
})
