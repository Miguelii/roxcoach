import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError, ProfileValidationError } from '@/_bff/lib/errors'
import { validateProfile } from '@/_bff/modules/athlete/helpers/profile-validation.helper'
import { upsertProfile } from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'
import type { ProfileDTO, ProfileInput } from '@/_bff/modules/athlete/types'

// Validates first and writes nothing on invalid input. Runs as the signed-in user (RLS applies).
export const updateProfile = Effect.fn('updateProfile')(function* (
    user: User,
    input: ProfileInput
) {
    const validation = validateProfile(input)
    if (!validation.ok)
        return yield* new ProfileValidationError({
            cause: validation.message,
            error_hash: ErrorCode.ATHLETE_PROFILE_INVALID,
            field: validation.field,
        })

    const supabase = yield* Effect.tryPromise({
        try: () => createDBServerClient(),
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.ATHLETE_SB_CLIENT }),
    })

    // An empty notes string is stored as NULL.
    const saved: ProfileDTO = {
        ...input,
        displayName: input.displayName.trim(),
        notes: input.notes === '' ? null : input.notes,
    }
    yield* upsertProfile(supabase, user.id, saved)
    return saved
})
