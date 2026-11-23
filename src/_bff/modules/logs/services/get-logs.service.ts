import 'server-only'

import { Effect } from 'effect'
import { LOG_RANGE_MS, LOGS_FETCH_LIMIT, type LogEntry } from '@/_bff/core/constants/logs.constants'
import { createDBPublicAdminClient } from '@/_bff/core/db'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { LogsClientError, LogsQueryError } from '@/_bff/lib/errors'
import { getAthleteDisplayNames } from '@/_bff/modules/athlete/services/get-athlete-display-names.service'
import { selectLogs } from '@/_bff/modules/logs/repositories/logs.repository'
import type { GetLogsInput } from '@/_bff/modules/logs/types'

type GetLogsDependencies = {
    createClient: () => ReturnType<typeof createDBPublicAdminClient>
    now: () => Date
    getDisplayNames: typeof getAthleteDisplayNames
}

const DEFAULT_DEPENDENCIES: GetLogsDependencies = {
    createClient: createDBPublicAdminClient,
    now: () => new Date(),
    getDisplayNames: getAthleteDisplayNames,
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

    // SAFETY: the `logs` columns selected above are the LogEntry fields, minus the display name.
    const rows = (data ?? []) as Omit<LogEntry, 'display_name'>[]
    const userIds = Array.from(new Set(rows.flatMap((row) => row.user_id ?? [])))
    // A name that cannot be read must not hide the logs: the page falls back to the user id.
    const names =
        userIds.length === 0
            ? new Map<string, string>()
            : yield* dependencies
                  .getDisplayNames(userIds)
                  .pipe(Effect.catch(() => Effect.succeed(new Map<string, string>())))
    const logs: LogEntry[] = rows.map((row) => ({
        ...row,
        display_name: row.user_id === null ? null : (names.get(row.user_id) ?? null),
    }))
    return { logs, isTruncated: logs.length >= LOGS_FETCH_LIMIT }
})
