import 'server-only'

import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { ActivityFileStorageError } from '@/_bff/lib/errors'
import type { StorageClient } from '@/_bff/modules/training/types'

const BUCKET = 'activity-files'

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
