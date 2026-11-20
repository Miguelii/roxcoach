import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { selectRaces } from '@/_bff/modules/races/repositories/races.repository'
import { createRacesClient } from '@/_bff/modules/races/services/races-client.service'
import type { RaceFilter } from '@/_bff/modules/races/types'

// Also the read entry point for other modules (for example the coach chat).
export const listRaces = Effect.fn('listRaces')(function* (user: User, filter: RaceFilter) {
    const supabase = yield* createRacesClient()
    return yield* selectRaces(supabase, user.id, filter)
})
