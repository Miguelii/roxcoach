import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { RaceNotFoundError, RaceStateError } from '@/_bff/lib/errors'
import {
    deleteRace as deleteRaceRow,
    selectRaceById,
} from '@/_bff/modules/races/repositories/races.repository'
import { createRacesClient } from '@/_bff/modules/races/services/races-client.service'

// Hard delete, only for a race without a result (cancel it instead to keep it as history).
export const deleteRace = Effect.fn('deleteRace')(function* (user: User, id: string) {
    const supabase = yield* createRacesClient()
    const existing = yield* selectRaceById(supabase, user.id, id)
    if (existing === null)
        return yield* new RaceNotFoundError({
            cause: 'Race not found',
            error_hash: ErrorCode.RACES_NOT_FOUND,
        })
    if (existing.status === 'completed' || existing.resultTimeS !== null)
        return yield* new RaceStateError({
            cause: 'A race with a result cannot be deleted',
            error_hash: ErrorCode.RACES_STATE_COMPLETED,
        })

    const deleted = yield* deleteRaceRow(supabase, user.id, id)
    if (!deleted)
        return yield* new RaceNotFoundError({
            cause: 'Race not found',
            error_hash: ErrorCode.RACES_NOT_FOUND,
        })
    return { id }
})
