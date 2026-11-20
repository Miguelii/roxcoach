import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { selectRaces } from '@/_bff/modules/races/repositories/races.repository'
import { createRacesClient } from '@/_bff/modules/races/services/races-client.service'

// Upcoming and completed races between two dates (inclusive). Cancelled ones are not shown.
export const listRacesInRange = Effect.fn('listRacesInRange')(function* (
    user: User,
    from: string,
    to: string
) {
    const supabase = yield* createRacesClient()
    return yield* selectRaces(supabase, user.id, { status: ['upcoming', 'completed'], from, to })
})
