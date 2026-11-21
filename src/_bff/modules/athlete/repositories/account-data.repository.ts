import 'server-only'

import { Effect } from 'effect'
import { ACTIVITY_FILES_BUCKET } from '@/_bff/core/constants/storage.constants'
import type { createDBAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { AccountDeletionError } from '@/_bff/lib/errors'

type AdminClient = ReturnType<typeof createDBAdminClient>

// Supabase lists at most 1000 objects per call.
const PAGE_SIZE = 1000

// A safety stop: 100 pages is 100 000 files, far beyond one athlete.
const MAX_PAGES = 100

/**
 * Removes every original activity file of the user from storage (the folder `<userId>/`). It lists
 * a page, removes it and lists again until the folder is empty, so it works for any number of
 * files. This runs before the user is deleted: a failure stops the deletion and the user can try
 * again.
 * @param supabase - The service-role client.
 * @param userId - The user whose files are removed.
 */
export const removeAllActivityFiles = Effect.fn('removeAllActivityFiles')(function* (
    supabase: AdminClient,
    userId: string
) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data, error } = yield* Effect.tryPromise({
            try: () =>
                supabase.storage.from(ACTIVITY_FILES_BUCKET).list(userId, { limit: PAGE_SIZE }),
            catch: (cause) =>
                new AccountDeletionError({
                    cause: String(cause),
                    error_hash: ErrorCode.ATHLETE_DELETE_FILES_LIST,
                }),
        })

        if (error)
            return yield* new AccountDeletionError({
                cause: error.message,
                error_hash: ErrorCode.ATHLETE_DELETE_FILES_LIST_ERR,
            })
        if (data.length === 0) return

        const paths = data.map((file) => `${userId}/${file.name}`)
        const removed = yield* Effect.tryPromise({
            try: () => supabase.storage.from(ACTIVITY_FILES_BUCKET).remove(paths),
            catch: (cause) =>
                new AccountDeletionError({
                    cause: String(cause),
                    error_hash: ErrorCode.ATHLETE_DELETE_FILES_REMOVE,
                }),
        })

        if (removed.error)
            return yield* new AccountDeletionError({
                cause: removed.error.message,
                error_hash: ErrorCode.ATHLETE_DELETE_FILES_REMOVE_ERR,
            })
    }
})

/**
 * Deletes the auth user. Every Roxcoach table references `auth.users` with `on delete cascade`, so
 * this removes all the user's rows (activities and their laps, sets and file rows, races,
 * availability, coach conversations and messages, the Lyfta connection, coach usage and the
 * profile) in one step, and any table added later is covered by its own foreign key.
 * @param supabase - The service-role client (the Auth admin API needs the service-role key).
 * @param userId - The signed-in user's id.
 */
export const deleteAuthUser = Effect.fn('deleteAuthUser')(function* (
    supabase: AdminClient,
    userId: string
) {
    const { error } = yield* Effect.tryPromise({
        try: () => supabase.auth.admin.deleteUser(userId),
        catch: (cause) =>
            new AccountDeletionError({
                cause: String(cause),
                error_hash: ErrorCode.ATHLETE_DELETE_USER,
            }),
    })

    if (error)
        return yield* new AccountDeletionError({
            cause: error.message,
            error_hash: ErrorCode.ATHLETE_DELETE_USER_ERR,
        })
})
