import 'server-only'

import type { User } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { CreateSbClientError } from '@/_bff/lib/errors'
import {
    countActivitiesBySource,
    deleteActivitiesBySource,
} from '@/_bff/modules/training/repositories/activities.repository'
import type { ClearableSource, TrainingClient } from '@/_bff/modules/training/types'

type SourceActivitiesDependencies = {
    createClient: () => Promise<TrainingClient>
}

const DEFAULT_DEPENDENCIES: SourceActivitiesDependencies = { createClient: createDBServerClient }

const createClientEffect = (dependencies: SourceActivitiesDependencies) =>
    Effect.tryPromise({
        try: dependencies.createClient,
        catch: (cause) =>
            new CreateSbClientError({ cause, error_hash: ErrorCode.TRAINING_SB_CLIENT }),
    })

export const countSourceActivities = Effect.fn('countSourceActivities')(function* (
    user: User,
    source: ClearableSource,
    dependencies: SourceActivitiesDependencies = DEFAULT_DEPENDENCIES
) {
    const supabase = yield* createClientEffect(dependencies)
    return yield* countActivitiesBySource(supabase, user.id, source)
})

// Runs as the signed-in athlete, so the delete is bound to their own rows twice: by the
// `user_id` filter and by RLS.
export const clearSourceActivities = Effect.fn('clearSourceActivities')(function* (
    user: User,
    source: ClearableSource,
    dependencies: SourceActivitiesDependencies = DEFAULT_DEPENDENCIES
) {
    const supabase = yield* createClientEffect(dependencies)
    return yield* deleteActivitiesBySource(supabase, user.id, source)
})
