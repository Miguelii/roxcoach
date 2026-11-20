import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { AvailabilityValidationError, CreateSbClientError } from '@/_bff/lib/errors'
import { validateAvailability } from '@/_bff/modules/athlete/helpers/availability-validation.helper'
import {
    deleteSlotsExcept,
    upsertSlots,
} from '@/_bff/modules/athlete/repositories/availability-slots.repository'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'

// Validates, upserts the new set, and only then deletes the rows outside it, so the week is never
// empty midway. A failed upsert deletes nothing; a failed delete leaves the new slots saved.
export const saveAvailability = Effect.fn('saveAvailability')(function* (
    user: User,
    slots: AvailabilitySlotDTO[]
) {
    const validation = validateAvailability(slots)
    if (!validation.ok)
        return yield* new AvailabilityValidationError({
            cause: validation.reason,
            error_hash: ErrorCode.ATHLETE_AVAILABILITY_INVALID,
            reason: validation.reason,
        })

    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({
                cause,
                error_hash: ErrorCode.ATHLETE_AVAILABILITY_SB_CLIENT,
            }),
    })

    yield* upsertSlots(supabase, user.id, slots)
    yield* deleteSlotsExcept(
        supabase,
        user.id,
        slots.map(({ weekday, sessionKind }) => ({ weekday, sessionKind }))
    )
    return slots
})
