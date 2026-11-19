import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import type { createDBAdminClient, createDBServerClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ProfileQueryError } from '@/_bff/lib/errors'

// The service-role client (jobs, webhook) or the signed-in user's client.
type ProfilesClient =
    | ReturnType<typeof createDBAdminClient>
    | Awaited<ReturnType<typeof createDBServerClient>>

const TABLE = 'athlete_profiles'

// The column default, used when the athlete has no profile row yet.
const DEFAULT_TIMEZONE = 'Europe/Lisbon'

const timezoneRowSchema = z.object({ timezone: z.string().min(1) })

export const selectTimezone = Effect.fn('selectTimezone')(function* (
    supabase: ProfilesClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).select('timezone').eq('user_id', userId).maybeSingle(),
        catch: (cause) =>
            new ProfileQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_PROFILE_SELECT,
            }),
    })

    if (error)
        return yield* new ProfileQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ATHLETE_PROFILE_SELECT_ERR,
        })
    if (data === null) return DEFAULT_TIMEZONE

    const parsed = timezoneRowSchema.safeParse(data)
    if (!parsed.success)
        return yield* new ProfileQueryError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.ATHLETE_PROFILE_SELECT_PARSE,
        })

    return parsed.data.timezone
})
