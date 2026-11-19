import 'server-only'

import { cache } from 'react'
import { Effect } from 'effect'
import { createDBServerClient } from '@/_bff/core/db'
import { CreateSbClientError, GetUserError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import type { User } from '@supabase/supabase-js'

type DBClient = Awaited<ReturnType<typeof createDBServerClient>>

type SessionResult =
    | { ok: true; user: User | null }
    | { ok: false; kind: 'sb-client'; cause: unknown }
    | { ok: false; kind: 'get-user'; cause: unknown }

/**
 * Resolves the current user once per request.
 *
 * Wrapped in React `cache()` with no arguments, so every `getSession()` call within the same
 * server request shares a single `supabase.auth.getUser()` round-trip (it revalidates the JWT
 * against Supabase Auth, which is a network call). The cache is request-scoped, so one user's
 * session never leaks into another request.
 *
 * Never rejects: infrastructure failures are returned as a tagged result so the Effect layer can
 * map them to tagged errors.
 */
const resolveUser = cache(async (): Promise<SessionResult> => {
    let supabase: DBClient

    try {
        supabase = await createDBServerClient()
    } catch (cause) {
        return { ok: false, kind: 'sb-client', cause }
    }

    try {
        const { data, error } = await supabase.auth.getUser()
        return { ok: true, user: error ? null : (data?.user ?? null) }
    } catch (cause) {
        return { ok: false, kind: 'get-user', cause }
    }
})

/**
 * The result is cached per request: a sign-in or sign-out later in the same request is not
 * reflected by a subsequent `getSession()` call.
 */
export const getSession = Effect.fn('getSession')(function* () {
    const result = yield* Effect.promise(() => resolveUser())

    if (!result.ok) {
        if (result.kind === 'sb-client') {
            return yield* new CreateSbClientError({
                cause: result.cause,
                error_hash: ErrorCode.AUTH_SESSION_SB_CLIENT,
            })
        }

        return yield* new GetUserError({
            cause: result.cause,
            error_hash: ErrorCode.AUTH_SESSION_GET_USER,
        })
    }

    return result.user
})
