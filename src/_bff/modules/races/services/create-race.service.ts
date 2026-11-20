import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { todayIn } from '@/_bff/core/utils/date.utils'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { RaceValidationError } from '@/_bff/lib/errors'
import { getAthleteTimezone } from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import { validateRace } from '@/_bff/modules/races/helpers/race-validation.helper'
import { insertRace } from '@/_bff/modules/races/repositories/races.repository'
import { createRacesClient } from '@/_bff/modules/races/services/races-client.service'
import type { RaceInput } from '@/_bff/modules/races/types'

// "Today" is the athlete's local date, so a race tomorrow in Lisbon is never rejected because
// UTC already rolled over. Validates first and writes nothing on invalid input.
export const createRace = Effect.fn('createRace')(function* (user: User, input: RaceInput) {
    const timezone = yield* getAthleteTimezone(user)
    const validation = validateRace(input, todayIn(timezone))
    if (!validation.ok)
        return yield* new RaceValidationError({
            cause: validation.message,
            error_hash: ErrorCode.RACES_INVALID,
            field: validation.field,
        })

    const supabase = yield* createRacesClient()
    return yield* insertRace(supabase, user.id, input)
})
