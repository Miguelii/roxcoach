import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'
import { Effect } from 'effect'
import { z } from 'zod'
import type { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { StravaConnectionError } from '@/_bff/lib/errors'
import { redact } from '@/_bff/modules/strava/helpers/strava-api.client'

// Service-role client: strava_connections has no client policy and no grant to `authenticated`.
type AdminClient = ReturnType<typeof createDBAdminClient>

type StravaConnection = {
    user_id: string
    strava_athlete_id: number
    access_token: string
    refresh_token: string
    expires_at: string
    scope: string
    connected_at: string | null
    last_synced_at: string | null
}

type ConnectionInput = {
    strava_athlete_id: number
    access_token: string
    refresh_token: string
    expires_at: string
    scope: string
}

type ReturnedError = Pick<PostgrestError, 'code' | 'message'>

type TokenSet = { access_token: string; refresh_token: string; expires_at: string }

// Only the service-role client may touch this table (no client policies, no grants).
const TABLE = 'strava_connections'

const COLUMNS =
    'user_id, strava_athlete_id, access_token, refresh_token, expires_at, scope, connected_at, last_synced_at'

// PostgREST serializes bigint as a JSON number, but a string is accepted too. Strava athlete ids
// stay far below Number.MAX_SAFE_INTEGER, so `number` loses nothing.
const connectionRowSchema = z.object({
    user_id: z.string(),
    strava_athlete_id: z.union([z.number().int(), z.string().regex(/^\d+$/u).transform(Number)]),
    access_token: z.string(),
    refresh_token: z.string(),
    expires_at: z.string(),
    scope: z.string(),
    connected_at: z.string().nullable(),
    last_synced_at: z.string().nullable(),
})

// Postgres errors can echo the failing row (tokens included) in `details` or `hint`, so only the
// code and the redacted message of a returned error are kept as the cause.
const returnedError = (
    error: ReturnedError,
    error_hash: ErrorCode,
    secrets: readonly string[] = []
) =>
    new StravaConnectionError({
        cause: redact(`${error.code}: ${error.message}`, secrets),
        error_hash,
    })

// A thrown error is reduced to its redacted text (`String(error)` gives "Name: message"), never the
// object itself, which could carry a request body.
const thrownError = (text: string, error_hash: ErrorCode, secrets: readonly string[] = []) =>
    new StravaConnectionError({ cause: redact(text, secrets), error_hash })

export const selectConnection = Effect.fn('selectConnection')(function* (
    supabase: AdminClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).select(COLUMNS).eq('user_id', userId).maybeSingle(),
        catch: (cause) => thrownError(String(cause), ErrorCode.STRAVA_CONN_SELECT),
    })

    if (error) return yield* returnedError(error, ErrorCode.STRAVA_CONN_SELECT_ERR)
    if (data === null) return null

    const parsed = connectionRowSchema.safeParse(data)
    if (!parsed.success)
        return yield* new StravaConnectionError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.STRAVA_CONN_SELECT_PARSE,
        })

    const connection: StravaConnection = parsed.data
    return connection
})

export const upsertConnection = Effect.fn('upsertConnection')(function* (
    supabase: AdminClient,
    userId: string,
    input: ConnectionInput
) {
    const secrets = [input.access_token, input.refresh_token]
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.from(TABLE).upsert({ user_id: userId, ...input }, { onConflict: 'user_id' }),
        catch: (cause) => thrownError(String(cause), ErrorCode.STRAVA_CONN_UPSERT, secrets),
    })

    if (error) return yield* returnedError(error, ErrorCode.STRAVA_CONN_UPSERT_ERR, secrets)
})

export const deleteConnection = Effect.fn('deleteConnection')(function* (
    supabase: AdminClient,
    userId: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).delete().eq('user_id', userId),
        catch: (cause) => thrownError(String(cause), ErrorCode.STRAVA_CONN_DELETE),
    })

    if (error) return yield* returnedError(error, ErrorCode.STRAVA_CONN_DELETE_ERR)
})

// Compare-and-swap: the update only applies while the stored refresh token is still the one the
// caller refreshed with, so of two concurrent refreshes exactly one wins. Returns whether a row
// changed, read from the returned rows (a no-match update is not an error).
export const updateTokensIfRefreshTokenMatches = Effect.fn('updateTokensIfRefreshTokenMatches')(
    function* (
        supabase: AdminClient,
        userId: string,
        previousRefreshToken: string,
        tokens: TokenSet
    ) {
        const secrets = [previousRefreshToken, tokens.access_token, tokens.refresh_token]
        const { data, error } = yield* Effect.tryPromise({
            try: () =>
                supabase
                    .from(TABLE)
                    .update(tokens)
                    .eq('user_id', userId)
                    .eq('refresh_token', previousRefreshToken)
                    .select('user_id'),
            catch: (cause) =>
                thrownError(String(cause), ErrorCode.STRAVA_CONN_UPDATE_TOKENS, secrets),
        })

        if (error)
            return yield* returnedError(error, ErrorCode.STRAVA_CONN_UPDATE_TOKENS_ERR, secrets)

        return Array.isArray(data) && data.length > 0
    }
)

export const touchLastSyncedAt = Effect.fn('touchLastSyncedAt')(function* (
    supabase: AdminClient,
    userId: string,
    at: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).update({ last_synced_at: at }).eq('user_id', userId),
        catch: (cause) => thrownError(String(cause), ErrorCode.STRAVA_CONN_TOUCH),
    })

    if (error) return yield* returnedError(error, ErrorCode.STRAVA_CONN_TOUCH_ERR)
})

// Webhook owner lookup: keyed by the Strava athlete id because the event carries no user id.
export const findConnectionByStravaAthleteId = Effect.fn('findConnectionByStravaAthleteId')(
    function* (supabase: AdminClient, stravaAthleteId: number) {
        const { data, error } = yield* Effect.tryPromise({
            try: () =>
                supabase
                    .from(TABLE)
                    .select('user_id')
                    .eq('strava_athlete_id', stravaAthleteId)
                    .maybeSingle(),
            catch: (cause) => thrownError(String(cause), ErrorCode.STRAVA_CONN_FIND_OWNER),
        })

        if (error) return yield* returnedError(error, ErrorCode.STRAVA_CONN_FIND_OWNER_ERR)
        if (data === null) return null

        return { user_id: String(data.user_id) }
    }
)
