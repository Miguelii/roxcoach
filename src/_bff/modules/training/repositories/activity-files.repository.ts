import 'server-only'

import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    ActivityQueryError,
    ActivityWriteError,
    DuplicateActivityFileError,
} from '@/_bff/lib/errors'
import type { NewActivityFileRow, TrainingClient } from '@/_bff/modules/training/types'
import { selectColumns } from '@/_bff/core/db/columns'
import { DbTables } from '@/_bff/core/db/tables'

const UNIQUE_VIOLATION = '23505'

// Only the code and the message of a returned error are kept (details can echo the row, which
// carries the original file name).
export const insertActivityFile = Effect.fn('insertActivityFile')(function* (
    supabase: TrainingClient,
    userId: string,
    row: NewActivityFileRow
) {
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.from(DbTables.ACTIVITY_FILES).insert({ ...row, user_id: userId }),
        catch: (cause) =>
            new ActivityWriteError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_FILE_ROW_INSERT,
            }),
    })

    if (error?.code === UNIQUE_VIOLATION)
        return yield* new DuplicateActivityFileError({
            cause: 'unique (user_id, sha256) violated',
            error_hash: ErrorCode.TRAINING_FILE_DUPLICATE,
        })
    if (error)
        return yield* new ActivityWriteError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.TRAINING_FILE_ROW_INSERT_ERR,
        })
})

// Cheap pre-check so a known duplicate never uploads an object. The unique index still decides races.
export const selectFileIdBySha256 = Effect.fn('selectFileIdBySha256')(function* (
    supabase: TrainingClient,
    userId: string,
    sha256: string
) {
    const { data, error } = yield* Effect.tryPromise({
        try: () =>
            supabase
                .from(DbTables.ACTIVITY_FILES)
                .select(selectColumns(DbTables.ACTIVITY_FILES, ['id']))
                .eq('user_id', userId)
                .eq('sha256', sha256)
                .maybeSingle(),
        catch: (cause) =>
            new ActivityQueryError({
                cause: String(cause),
                error_hash: ErrorCode.TRAINING_FILE_HASH_LOOKUP,
            }),
    })

    if (error)
        return yield* new ActivityQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.TRAINING_FILE_HASH_LOOKUP_ERR,
        })

    return data?.id ?? null
})
