import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { CONVERSATIONS_RETURNED } from '@/_bff/modules/coach/constants'
import { selectConversations } from '@/_bff/modules/coach/repositories/coach-conversations.repository'
import { createCoachClient } from '@/_bff/modules/coach/services/coach-client.service'

// The athlete's latest conversations, newest first.
export const listConversations = Effect.fn('listConversations')(function* (user: User) {
    const supabase = yield* createCoachClient()
    return yield* selectConversations(supabase, user.id, CONVERSATIONS_RETURNED)
})
