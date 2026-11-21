import 'server-only'

import { Effect } from 'effect'
import { ACTIVITY_FILES_BUCKET } from '@/_bff/core/constants/storage.constants'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityFileStorageError } from '@/_bff/lib/errors'
import type { StorageClient, StorageReadClient } from '@/_bff/modules/training/types'

const BUCKET = ACTIVITY_FILES_BUCKET

// The only place that touches `supabase.storage`. Paths are `<userId>/<fileId>.<format>`, so the
// storage policy (first folder is the caller) applies; the original file name is never part of them.
export const putActivityFile = Effect.fn('putActivityFile')(function* (
    supabase: StorageClient,
    path: string,
    bytes: Uint8Array,
    contentType: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () =>
            supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false }),
        catch: (cause) =>
            new ActivityFileStorageError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_FILE_STORAGE_PUT,
            }),
    })

    if (error)
        return yield* new ActivityFileStorageError({
            cause: error.message,
            error_hash: ErrorCode.TRAINING_FILE_STORAGE_PUT_ERR,
        })
})

export const removeActivityFile = Effect.fn('removeActivityFile')(function* (
    supabase: StorageClient,
    path: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.storage.from(BUCKET).remove([path]),
        catch: (cause) =>
            new ActivityFileStorageError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_FILE_STORAGE_REMOVE,
            }),
    })

    if (error)
        return yield* new ActivityFileStorageError({
            cause: error.message,
            error_hash: ErrorCode.TRAINING_FILE_STORAGE_REMOVE_ERR,
        })
})

// Reads an original file back for reprocessing. A missing body without an error is a failure too.
export const getActivityFile = Effect.fn('getActivityFile')(function* (
    supabase: StorageReadClient,
    path: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () => supabase.storage.from(BUCKET).download(path),
        catch: (cause) =>
            new ActivityFileStorageError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_FILE_STORAGE_GET,
            }),
    })

    if (error || data === null)
        return yield* new ActivityFileStorageError({
            cause: error?.message ?? 'empty download',
            error_hash: ErrorCode.TRAINING_FILE_STORAGE_GET_ERR,
        })

    return yield* Effect.tryPromise({
        try: async () => new Uint8Array(await data.arrayBuffer()),
        catch: (cause) =>
            new ActivityFileStorageError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_FILE_STORAGE_GET_ERR,
            }),
    })
})
