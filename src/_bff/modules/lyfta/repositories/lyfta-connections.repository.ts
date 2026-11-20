import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    LyftaConnectionParseError,
    LyftaConnectionQueryError,
    LyftaConnectionWriteError,
} from '@/_bff/lib/errors'
import type { LyftaConnectionRecord } from '@/_bff/modules/lyfta/types'
import type { createDBAdminClient } from '@/_bff/core/db'

type AdminClient = ReturnType<typeof createDBAdminClient>
type ReturnedError = { code: string; message: string }

type ConnectionUpsert = {
    user_id: string
    encrypted_api_key: string
    last_synced_at?: null
}

const TABLE = 'lyfta_connections'
const connectionRowSchema = z.object({
    encrypted_api_key: z.string().min(1),
    last_synced_at: z.string().nullable(),
})

const queryError = (error: ReturnedError, error_hash: ErrorCode) =>
    new LyftaConnectionQueryError({
        cause: `${error.code}: ${error.message}`,
        error_hash,
    })

export const selectLyftaConnection = Effect.fn('selectLyftaConnection')(function* (
    supabase: AdminClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('encrypted_api_key, last_synced_at')
                .eq('user_id', userId)
                .maybeSingle(),
        catch: (cause) =>
            new LyftaConnectionQueryError({
                cause: String(cause),
                error_hash: ErrorCode.LYFTA_CONNECTION_QUERY,
            }),
    })

    if (error) return yield* queryError(error, ErrorCode.LYFTA_CONNECTION_QUERY)
    if (data === null) return null

    const parsed = connectionRowSchema.safeParse(data)
    if (!parsed.success) {
        return yield* new LyftaConnectionParseError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.LYFTA_CONNECTION_PARSE,
        })
    }

    const record: LyftaConnectionRecord = {
        encryptedApiKey: parsed.data.encrypted_api_key,
        lastSyncedAt: parsed.data.last_synced_at,
    }
    return record
})

// Saves the encrypted key. `resetCheckpoint` also clears last_synced_at, so the next sync of a
// replaced key is a full import for the new account.
export const upsertLyftaConnection = Effect.fn('upsertLyftaConnection')(function* (
    supabase: AdminClient,
    userId: string,
    encryptedApiKey: string,
    resetCheckpoint = false
) {
    const row: ConnectionUpsert = { user_id: userId, encrypted_api_key: encryptedApiKey }
    if (resetCheckpoint) row.last_synced_at = null
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).upsert(row, { onConflict: 'user_id' }),
        catch: (cause) =>
            new LyftaConnectionWriteError({
                cause: String(cause),
                error_hash: ErrorCode.LYFTA_CONNECTION_WRITE,
            }),
    })

    if (error)
        return yield* new LyftaConnectionWriteError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.LYFTA_CONNECTION_WRITE,
        })
})

export const updateLyftaLastSyncedAt = Effect.fn('updateLyftaLastSyncedAt')(function* (
    supabase: AdminClient,
    userId: string,
    lastSyncedAt: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ last_synced_at: lastSyncedAt })
                .eq('user_id', userId)
                .select('user_id')
                .maybeSingle(),
        catch: (cause) =>
            new LyftaConnectionWriteError({
                cause: String(cause),
                error_hash: ErrorCode.LYFTA_CHECKPOINT,
            }),
    })

    if (error)
        return yield* new LyftaConnectionWriteError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.LYFTA_CHECKPOINT,
        })
    if (data === null)
        return yield* new LyftaConnectionWriteError({
            cause: 'No Lyfta connection found for checkpoint update',
            error_hash: ErrorCode.LYFTA_CHECKPOINT,
        })
})

// Compare-and-set of the sync lease: takes it only when it is free or older than `staleBeforeIso`.
// True when this call took it. Filtered by user_id like every query.
export const takeLyftaSyncLease = Effect.fn('takeLyftaSyncLease')(function* (
    supabase: AdminClient,
    userId: string,
    startedAtIso: string,
    staleBeforeIso: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ sync_started_at: startedAtIso })
                .eq('user_id', userId)
                .or(`sync_started_at.is.null,sync_started_at.lt.${staleBeforeIso}`)
                .select('user_id')
                .maybeSingle(),
        catch: (cause) =>
            new LyftaConnectionWriteError({
                cause: String(cause),
                error_hash: ErrorCode.LYFTA_SYNC_LEASE,
            }),
    })

    if (error)
        return yield* new LyftaConnectionWriteError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.LYFTA_SYNC_LEASE,
        })
    return data !== null
})

// Releases the lease this sync took. Only a lease still carrying `startedAtIso` is cleared, so a
// stale lease another sync has since taken is never released by the old run.
export const releaseLyftaSyncLease = Effect.fn('releaseLyftaSyncLease')(function* (
    supabase: AdminClient,
    userId: string,
    startedAtIso: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ sync_started_at: null })
                .eq('user_id', userId)
                .eq('sync_started_at', startedAtIso),
        catch: (cause) =>
            new LyftaConnectionWriteError({
                cause: String(cause),
                error_hash: ErrorCode.LYFTA_SYNC_LEASE,
            }),
    })

    if (error)
        return yield* new LyftaConnectionWriteError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.LYFTA_SYNC_LEASE,
        })
})

export const deleteLyftaConnection = Effect.fn('deleteLyftaConnection')(function* (
    supabase: AdminClient,
    userId: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).delete().eq('user_id', userId),
        catch: (cause) =>
            new LyftaConnectionWriteError({
                cause: String(cause),
                error_hash: ErrorCode.LYFTA_CONNECTION_WRITE,
            }),
    })

    if (error)
        return yield* new LyftaConnectionWriteError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.LYFTA_CONNECTION_WRITE,
        })
})
