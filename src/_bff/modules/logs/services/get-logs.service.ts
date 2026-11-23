import 'server-only'

import { Effect } from 'effect'
import { LOG_RANGE_MS, LOGS_FETCH_LIMIT, type LogEntry } from '@/_bff/core/constants/logs.constants'
import { createDBPublicAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LogsClientError, LogsQueryError } from '@/_bff/lib/errors'
import { selectLogs } from '@/_bff/modules/logs/repositories/logs.repository'
import type { GetLogsInput } from '@/_bff/modules/logs/types'

type GetLogsDependencies = {
    createClient: () => ReturnType<typeof createDBPublicAdminClient>
    now: () => Date
}

const DEFAULT_DEPENDENCIES: GetLogsDependencies = {
    createClient: createDBPublicAdminClient,
    now: () => new Date(),
}

export const getLogs = Effect.fn('getLogs')(function* (
    { range, search }: GetLogsInput,
    dependencies: GetLogsDependencies = DEFAULT_DEPENDENCIES
) {
    const supabase = yield* Effect.try({
        try: dependencies.createClient,
        catch: (cause) => new LogsClientError({ cause, error_hash: ErrorCode.LOGS_CLIENT }),
    })

    const since = new Date(dependencies.now().getTime() - LOG_RANGE_MS[range]).toISOString()
    const { data, error } = yield* Effect.tryPromise({
        try: () => selectLogs(supabase, { since, search: search || undefined }),
        catch: (cause) => new LogsQueryError({ cause, error_hash: ErrorCode.LOGS_QUERY }),
    })
    if (error) {
        return yield* new LogsQueryError({
            cause: `${error.code}: ${error.message}`,
            error_hash: ErrorCode.LOGS_QUERY,
        })
    }

    // SAFETY: the `logs` columns selected above are the LogEntry fields.
    const logs = (data ?? []) as LogEntry[]
    return { logs, isTruncated: logs.length >= LOGS_FETCH_LIMIT }
})
