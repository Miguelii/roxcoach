import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { RaceNotFoundError, RaceStateError, RaceValidationError } from '@/_bff/lib/errors'
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import { validateRace } from '@/_bff/modules/races/helpers/race-validation.helper'
import {
    selectRaceById,
    setRaceStatus,
    updateRace as updateRaceRow,
} from '@/_bff/modules/races/repositories/races.repository'
import { createRacesClient } from '@/_bff/modules/races/services/races-client.service'
import type { RaceInput } from '@/_bff/modules/races/types'

const notFound = () =>
    new RaceNotFoundError({ cause: 'Race not found', error_hash: ErrorCode.RACES_NOT_FOUND })

// A completed race keeps its date (it is in the past); an upcoming one must stay in the future
// unless its date is unchanged.
export const updateRace = Effect.fn('updateRace')(function* (
    user: User,
    id: string,
    input: RaceInput
) {
    const supabase = yield* createRacesClient()
    const existing = yield* selectRaceById(supabase, user.id, id)
    if (existing === null) return yield* notFound()

    const timezone = yield* getAthleteTimezone(user)
    const validation = validateRace(input, todayIn(timezone), {
        allowPastDate: existing.status === 'completed' || existing.raceDate === input.raceDate,
    })
    if (!validation.ok)
        return yield* new RaceValidationError({
            cause: validation.message,
            error_hash: ErrorCode.RACES_INVALID,
            field: validation.field,
        })

    const updated = yield* updateRaceRow(supabase, user.id, id, input)
    if (updated === null) return yield* notFound()
    return updated
})

// "Cancel race": the row stays (status = cancelled). A completed race cannot be cancelled.
export const cancelRace = Effect.fn('cancelRace')(function* (user: User, id: string) {
    const supabase = yield* createRacesClient()
    const existing = yield* selectRaceById(supabase, user.id, id)
    if (existing === null) return yield* notFound()
    if (existing.status === 'completed')
        return yield* new RaceStateError({
            cause: 'A completed race cannot be cancelled',
            error_hash: ErrorCode.RACES_STATE_COMPLETED,
        })

    // The update is guarded against completed rows: when it matches nothing, the race changed (or
    // vanished) after the read above, so re-read to report the right error.
    const updated = yield* setRaceStatus(supabase, user.id, id, 'cancelled')
    if (updated !== null) return updated
    const current = yield* selectRaceById(supabase, user.id, id)
    if (current?.status === 'completed')
        return yield* new RaceStateError({
            cause: 'A completed race cannot be cancelled',
            error_hash: ErrorCode.RACES_STATE_COMPLETED,
        })
    return yield* notFound()
})

// "Restore race": a cancelled race whose date has not passed goes back to upcoming. Today still
// counts as not passed, in the athlete's timezone.
export const restoreRace = Effect.fn('restoreRace')(function* (user: User, id: string) {
    const supabase = yield* createRacesClient()
    const existing = yield* selectRaceById(supabase, user.id, id)
    if (existing === null) return yield* notFound()
    if (existing.status !== 'cancelled')
        return yield* new RaceStateError({
            cause: 'Only a cancelled race can be restored',
            error_hash: ErrorCode.RACES_STATE_NOT_CANCELLED,
        })

    const timezone = yield* getAthleteTimezone(user)
    if (existing.raceDate < todayIn(timezone))
        return yield* new RaceStateError({
            cause: 'A race whose date has passed cannot be restored',
            error_hash: ErrorCode.RACES_STATE_PAST,
        })

    const updated = yield* setRaceStatus(supabase, user.id, id, 'upcoming')
    if (updated === null) return yield* notFound()
    return updated
})
