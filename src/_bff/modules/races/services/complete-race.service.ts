import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { RaceNotFoundError, RaceStateError, RaceValidationError } from '@/_bff/lib/errors'
import { validateResultTime } from '@/_bff/modules/races/helpers/race-validation.helper'
import { selectRaceById, setRaceResult } from '@/_bff/modules/races/repositories/races.repository'
import { createRacesClient } from '@/_bff/modules/races/services/races-client.service'

const notFound = () =>
    new RaceNotFoundError({ cause: 'Race not found', error_hash: ErrorCode.RACES_NOT_FOUND })

// Records the result and marks the race completed. A cancelled race cannot be completed.
export const completeRace = Effect.fn('completeRace')(function* (
    user: User,
    id: string,
    resultTimeS: number
) {
    const validation = validateResultTime(resultTimeS)
    if (!validation.ok)
        return yield* new RaceValidationError({
            cause: validation.message,
            error_hash: ErrorCode.RACES_INVALID,
            field: validation.field,
        })

    const supabase = yield* createRacesClient()
    const existing = yield* selectRaceById(supabase, user.id, id)
    if (existing === null) return yield* notFound()
    if (existing.status === 'cancelled')
        return yield* new RaceStateError({
            cause: 'A cancelled race cannot be completed',
            error_hash: ErrorCode.RACES_STATE_CANCELLED,
        })

    const updated = yield* setRaceResult(supabase, user.id, id, resultTimeS)
    if (updated === null) return yield* notFound()
    return updated
})
