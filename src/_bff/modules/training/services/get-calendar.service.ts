import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, InvalidDateRangeError } from '@/_bff/lib/errors'
import { listRacesInRange } from '@/_bff/modules/races/services/list-races-in-range.service'
import { selectActivitiesInRange } from '@/_bff/modules/training/repositories/activities.repository'
import type { CalendarItem } from '@/_bff/modules/training/types'

type DateRange = { from: string; to: string }

const MAX_RANGE_DAYS = 100
const MS_PER_DAY = 86_400_000
const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u

// Whole days since the epoch of a plain YYYY-MM-DD date, or null when it is not one. Date.UTC takes
// the parts directly, so no timezone or DST shift can move the day.
const toDayNumber = (date: string): number | null => {
    const match = PLAIN_DATE.exec(date)
    if (match === null) return null
    const [, year, month, day] = match
    return Math.round(Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY)
}

const validateRange = Effect.fn('validateRange')(function* (range: DateRange) {
    const from = toDayNumber(range.from)
    const to = toDayNumber(range.to)

    if (from === null || to === null || from > to)
        return yield* new InvalidDateRangeError({
            cause: 'range must be two YYYY-MM-DD dates with from <= to',
            error_hash: ErrorCode.TRAINING_RANGE_INVALID,
        })

    if (to - from > MAX_RANGE_DAYS)
        return yield* new InvalidDateRangeError({
            cause: `range spans more than ${MAX_RANGE_DAYS} days`,
            error_hash: ErrorCode.TRAINING_RANGE_TOO_LONG,
        })
})

// Runs as the signed-in user (publishable key), so RLS applies on top of the explicit user filter.
export const getCalendar = Effect.fn('getCalendar')(function* (user: User, range: DateRange) {
    yield* validateRange(range)

    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
    })

    const activities = yield* selectActivitiesInRange(supabase, user.id, range.from, range.to)

    const races = yield* listRacesInRange(user, range.from, range.to)

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
