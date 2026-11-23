import 'server-only'

import { after } from 'next/server'
import { createDBPublicAdminClient } from '@/_bff/core/db'
import {
    serializeLogMetadata,
    serializeLogValue,
    type LogMetadata,
    type LogValue,
} from '@/_bff/lib/log-serializer'
import {
    createLogWriter,
    shouldPersistLogs,
    type LogProps,
    type LogRow,
} from '@/_bff/lib/log-writer'
import { ServerEnv } from '@/env/server'

export type { LogProps } from '@/_bff/lib/log-writer'

type LogDetails = {
    timestamp: string
    userId?: string
    error?: LogValue
    metadata?: LogMetadata
}

function buildDetails(props: LogProps): LogDetails {
    const { error, metadata, userId } = props
    const details: LogDetails = { timestamp: new Date().toISOString() }

    if (userId !== undefined) details.userId = userId

    if (error !== undefined) details.error = serializeLogValue(error)

    if (metadata !== undefined) details.metadata = serializeLogMetadata(metadata)

    return details
}

// Never throws: it runs inside the error path of runEffect, where a throw would replace the mapped
// TRPCError with a different, distinguishable failure. When the payload cannot be serialized (a
// throwing getter or Proxy) only the header is printed, never the payload.
function logToConsole(props: LogProps): void {
    const { level, prefix, message } = props
    const header = message ? `[${prefix}] ${message}` : `[${prefix}]`

    try {
        console[level](header, buildDetails(props))
    } catch {
        try {
            console[level](header, { serializationFailed: true })
        } catch {
            // The console itself is unusable: nothing left to do
        }
    }
}

const insertLogRow = async (row: LogRow) => {
    const { error } = await createDBPublicAdminClient().from('logs').insert(row)
    if (error) throw new Error(error.message)
}

// `after` only exists inside a request scope; tasks and instrumentation insert directly.
const scheduleInsert = (run: () => Promise<void>) => {
    try {
        after(run)
    } catch {
        void run()
    }
}

const writer = createLogWriter({
    enabled: shouldPersistLogs(ServerEnv.NODE_ENV, ServerEnv.NEXT_LOGS_PERSIST),
    insert: insertLogRow,
    schedule: scheduleInsert,
    reportFailure: (message) => {
        console.error('[Logger] persist failed', message)
    },
})

export function Logger(props: LogProps): void {
    logToConsole(props)
    writer.log(props)
}

export async function persistLog(props: LogProps): Promise<void> {
    logToConsole(props)
    await writer.persist(props)
}
