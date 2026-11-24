import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import { listRacesInRange } from '@/_bff/modules/races/services/list-races-in-range.service'
import {
    validateRange,
    type DateRange,
} from '@/_bff/modules/training/helpers/validate-calendar-range.helper'
import { selectActivitiesInRange } from '@/_bff/modules/training/repositories/activities.repository'
import type { CalendarItem } from '@/_bff/modules/training/types'

// Runs as the signed-in user (publishable key), so RLS applies on top of the explicit user filter.
export const getCalendar = Effect.fn('getCalendar')(function* (user: User, range: DateRange) {
    yield* validateRange(range)

    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
    })

    const [activities, races] = yield* Effect.all(
        [
            selectActivitiesInRange(supabase, user.id, range.from, range.to),
            listRacesInRange(user, range.from, range.to),
        ],
        { concurrency: 2 }
    )

    const items: CalendarItem[] = [
        ...activities.map((activity): CalendarItem => ({
            type: 'activity',
            date: activity.localDate,
            activity,
        })),
        ...races.map((race): CalendarItem => ({
            type: 'race',
            date: race.raceDate,
            race: {
                id: race.id,
                name: race.name,
                raceType: race.raceType,
                raceDate: race.raceDate,
                targetTimeS: race.targetTimeS,
                priority: race.priority,
                status: race.status,
            },
        })),
    ]

    // Stable sort: on the same day activities keep their order and come before races.
    return items.toSorted((a, b) => a.date.localeCompare(b.date))
})
