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
import type { SyncOutcome } from '@/_bff/core/helpers/sync-state.helper'
import type { LyftaSyncResult } from '@/_bff/core/constants/lyfta.constants'

type AdminClient = ReturnType<typeof createDBAdminClient>
type ReturnedError = { code: string; message: string }

type IdleSyncState = {
    sync_status: 'idle'
    sync_started_at: null
    sync_finished_at: null
    sync_run_id: null
    sync_result: null
    sync_error: null
}

type ConnectionUpsert = {
    user_id: string
    encrypted_api_key: string
} & Partial<IdleSyncState & { last_synced_at: null }>

const TABLE = 'lyfta_connections'
const SELECT_COLUMNS =
    'encrypted_api_key, last_synced_at, sync_status, sync_started_at, sync_finished_at, sync_result, sync_error'
const IDLE_SYNC_STATE: IdleSyncState = {
    sync_status: 'idle',
    sync_started_at: null,
    sync_finished_at: null,
    sync_run_id: null,
    sync_result: null,
    sync_error: null,
}
const connectionRowSchema = z.object({
    encrypted_api_key: z.string().min(1),
    last_synced_at: z.string().nullable(),
    sync_status: z.string(),
    sync_started_at: z.string().nullable(),
    sync_finished_at: z.string().nullable(),
    sync_result: z.unknown(),
    sync_error: z.string().nullable(),
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
        try: () => supabase.from(TABLE).select(SELECT_COLUMNS).eq('user_id', userId).maybeSingle(),
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

    const { encrypted_api_key, last_synced_at, ...sync } = parsed.data
    const record: LyftaConnectionRecord = {
        encryptedApiKey: encrypted_api_key,
        lastSyncedAt: last_synced_at,
        sync,
    }
    return record
})

// Saves the encrypted key. `resetCheckpoint` also clears last_synced_at and the sync state, so the
// next sync of a replaced key is a full import for the new account.
export const upsertLyftaConnection = Effect.fn('upsertLyftaConnection')(function* (
    supabase: AdminClient,
    userId: string,
    encryptedApiKey: string,
    resetCheckpoint = false
) {
    const row: ConnectionUpsert = resetCheckpoint
        ? {
              user_id: userId,
              encrypted_api_key: encryptedApiKey,
              last_synced_at: null,
              ...IDLE_SYNC_STATE,
          }
        : { user_id: userId, encrypted_api_key: encryptedApiKey }
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

const syncStateWriteError = (cause: string) =>
    new LyftaConnectionWriteError({ cause, error_hash: ErrorCode.LYFTA_SYNC_LEASE })

// Compare-and-set of the sync lease: takes it only when no sync is running or the running one
// started before `staleBeforeIso`. True when this call took it.
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
                .update({
                    sync_status: 'running',
                    sync_started_at: startedAtIso,
                    sync_finished_at: null,
                    sync_run_id: null,
                    sync_result: null,
                    sync_error: null,
                })
                .eq('user_id', userId)
                .or(`sync_status.neq.running,sync_started_at.lt.${staleBeforeIso}`)
                .select('user_id')
                .maybeSingle(),
        catch: (cause) => syncStateWriteError(String(cause)),
    })

    if (error) return yield* syncStateWriteError(`${error.code}: ${error.message}`)
    return data !== null
})

// Writes of a background run only touch the lease it took, so a run that outlived its lease never
// overwrites a newer sync.
export const setLyftaSyncRunId = Effect.fn('setLyftaSyncRunId')(function* (
    supabase: AdminClient,
    userId: string,
    startedAtIso: string,
    runId: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ sync_run_id: runId })
                .eq('user_id', userId)
                .eq('sync_started_at', startedAtIso)
                .eq('sync_status', 'running'),
        catch: (cause) => syncStateWriteError(String(cause)),
    })

    if (error) return yield* syncStateWriteError(`${error.code}: ${error.message}`)
})

// Writing the outcome is the lease release. No row matched means a newer sync took the lease or
// the connection is gone, which is not an error.
export const finishLyftaSync = Effect.fn('finishLyftaSync')(function* (
    supabase: AdminClient,
    userId: string,
    startedAtIso: string,
    outcome: SyncOutcome<LyftaSyncResult>,
    finishedAtIso: string
) {
    const update =
        outcome.status === 'succeeded'
            ? { sync_result: outcome.result, sync_error: null }
            : { sync_result: null, sync_error: outcome.errorCode }
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(TABLE)
                .update({ sync_status: outcome.status, sync_finished_at: finishedAtIso, ...update })
                .eq('user_id', userId)
                .eq('sync_started_at', startedAtIso)
                .eq('sync_status', 'running'),
        catch: (cause) => syncStateWriteError(String(cause)),
    })

    if (error) return yield* syncStateWriteError(`${error.code}: ${error.message}`)
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
