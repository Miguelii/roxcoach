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
import type { SyncOutcome } from '@/_bff/core/helpers/sync-state.helper'
import type { ZeppSyncResult } from '@/_bff/core/constants/zepp.constants'
import type { ZeppConnectionRecord } from '@/_bff/modules/zepp/types'

type AdminClient = ReturnType<typeof createDBAdminClient>
type ReturnedError = { code: string; message: string }

const TABLE = 'zepp_connections'
const SELECT_COLUMNS =
    'encrypted_app_token, last_synced_at, sync_status, sync_started_at, sync_finished_at, sync_result, sync_error'
const connectionRowSchema = z.object({
    encrypted_app_token: z.string().min(1),
    last_synced_at: z.string().nullable(),
    sync_status: z.string(),
    sync_started_at: z.string().nullable(),
    sync_finished_at: z.string().nullable(),
    sync_result: z.unknown(),
    sync_error: z.string().nullable(),
})

const IDLE_SYNC_STATE = {
    sync_status: 'idle',
    sync_started_at: null,
    sync_finished_at: null,
    sync_run_id: null,
    sync_result: null,
    sync_error: null,
} as const

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
        try: () => supabase.from(TABLE).select(SELECT_COLUMNS).eq('user_id', userId).maybeSingle(),
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

    const { encrypted_app_token, last_synced_at, ...sync } = parsed.data
    const record: ZeppConnectionRecord = {
        encryptedAppToken: encrypted_app_token,
        lastSyncedAt: last_synced_at,
        sync,
    }
    return record
})

// A new token also clears the checkpoint and the sync state, so the next sync starts from the full
// history.
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
                    ...IDLE_SYNC_STATE,
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

const syncStateWriteError = (cause: string) =>
    new ZeppConnectionWriteError({ cause, error_hash: ErrorCode.ZEPP_SYNC_LEASE })

// Compare-and-set of the sync lease: takes it only when no sync is running or the running one
// started before `staleBeforeIso`. True when this call took it.
export const takeZeppSyncLease = Effect.fn('takeZeppSyncLease')(function* (
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
export const setZeppSyncRunId = Effect.fn('setZeppSyncRunId')(function* (
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
export const finishZeppSync = Effect.fn('finishZeppSync')(function* (
    supabase: AdminClient,
    userId: string,
    startedAtIso: string,
    outcome: SyncOutcome<ZeppSyncResult>,
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
