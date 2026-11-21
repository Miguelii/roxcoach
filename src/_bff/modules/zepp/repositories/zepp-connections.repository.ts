import 'server-only'

import { Effect } from 'effect'
import { z } from 'zod'
import type { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    ZeppConnectionParseError,
    ZeppConnectionQueryError,
    ZeppConnectionWriteError,
} from '@/_bff/lib/errors'
import type { ZeppConnectionRecord } from '@/_bff/modules/zepp/types'

type AdminClient = ReturnType<typeof createDBAdminClient>
type ReturnedError = { code: string; message: string }

const TABLE = 'zepp_connections'

const connectionRowSchema = z.object({
    encrypted_app_token: z.string().min(1),
    last_synced_at: z.string().nullable(),
})

const writeFailure = (cause: unknown) =>
    new ZeppConnectionWriteError({
        cause: String(cause),
        error_hash: ErrorCode.ZEPP_CONNECTION_WRITE,
    })

const writeError = (error: ReturnedError) =>
    new ZeppConnectionWriteError({
        cause: `${error.code}: ${error.message}`,
        error_hash: ErrorCode.ZEPP_CONNECTION_WRITE,
    })

export const selectZeppConnection = Effect.fn('selectZeppConnection')(function* (
    supabase: AdminClient,
    userId: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .select('encrypted_app_token, last_synced_at')
                .eq('user_id', userId)
                .maybeSingle(),
        catch: (cause) =>
            new ZeppConnectionQueryError({
                cause: String(cause),
                error_hash: ErrorCode.ZEPP_CONNECTION_QUERY,
            }),
    })

    if (error)
        return yield* new ZeppConnectionQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.ZEPP_CONNECTION_QUERY,
        })
    if (data === null) return null

    const parsed = connectionRowSchema.safeParse(data)
    if (!parsed.success)
        return yield* new ZeppConnectionParseError({
            cause: `Row failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
            error_hash: ErrorCode.ZEPP_CONNECTION_PARSE,
        })

    const record: ZeppConnectionRecord = {
        encryptedAppToken: parsed.data.encrypted_app_token,
        lastSyncedAt: parsed.data.last_synced_at,
    }
    return record
})

// A new token also clears the checkpoint, so the next sync starts from the full history.
export const upsertZeppConnection = Effect.fn('upsertZeppConnection')(function* (
    supabase: AdminClient,
    userId: string,
    encryptedAppToken: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.from(TABLE).upsert(
                {
                    user_id: userId,
                    encrypted_app_token: encryptedAppToken,
                    last_synced_at: null,
                },
                { onConflict: 'user_id' }
            ),
        catch: writeFailure,
    })
    if (error) return yield* writeError(error)
})

export const updateZeppLastSyncedAt = Effect.fn('updateZeppLastSyncedAt')(function* (
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
        catch: writeFailure,
    })
    if (error) return yield* writeError(error)
    if (data === null)
        return yield* new ZeppConnectionWriteError({
            cause: 'No Zepp connection found for the checkpoint update',
            error_hash: ErrorCode.ZEPP_CONNECTION_WRITE,
        })
})

export const deleteZeppConnection = Effect.fn('deleteZeppConnection')(function* (
    supabase: AdminClient,
    userId: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.from(TABLE).delete().eq('user_id', userId),
        catch: writeFailure,
    })
    if (error) return yield* writeError(error)
})
