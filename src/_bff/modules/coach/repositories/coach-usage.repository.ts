import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    runCoachWrite,
    type Codes,
    type CoachClient,
} from '@/_bff/modules/coach/repositories/coach-query'

const SLOT_CODES: Codes = {
    call: ErrorCode.COACH_USAGE_SLOT,
    returned: ErrorCode.COACH_USAGE_SLOT_ERR,
    parse: ErrorCode.COACH_USAGE_SLOT_PARSE,
}

// Takes one message slot of `day` (the athlete's local date, YYYY-MM-DD) atomically in the
// database. The function acts on the signed-in athlete only (auth.uid() under RLS), so there is
// no user id to pass. True when the slot was taken, false when `cap` is already reached.
export const takeMessageSlot = Effect.fn('takeMessageSlot')(function* (
    supabase: CoachClient,
    day: string,
    cap: number
) {
    return yield* runCoachWrite(
        () => supabase.rpc('coach_take_message_slot', { p_day: day, p_cap: cap }),
        SLOT_CODES,
        z.boolean()
    )
})
