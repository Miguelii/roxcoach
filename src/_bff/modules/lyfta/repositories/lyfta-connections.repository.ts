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

export const upsertLyftaConnection = Effect.fn('upsertLyftaConnection')(function* (
    supabase: AdminClient,
    userId: string,
    encryptedApiKey: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.from(TABLE).upsert(
                {
                    user_id: userId,
                    encrypted_api_key: encryptedApiKey,
                },
                { onConflict: 'user_id' }
            ),
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
