import { z } from 'zod'
import {
    serializeLogMetadata,
    serializeLogValue,
    type LogMetadata,
} from '@/_bff/lib/log-serializer'

export type LogProps = {
    level: 'log' | 'warn' | 'error' | 'info'
    prefix: string
    error?: unknown
    message?: string
    metadata?: LogMetadata
    userId?: string
}

export type LogRow = {
    project: 'roxcoach'
    level: 'debug' | 'info' | 'warn' | 'error'
    prefix: string
    message: string | null
    metadata: LogMetadata | null
    user_id: string | null
}

type LogWriterDependencies = {
    enabled: boolean
    insert: (row: LogRow) => Promise<void>
    schedule: (run: () => Promise<void>) => void
    reportFailure: (message: string) => void
}

const taggedErrorSchema = z.object({ _tag: z.string() })

// A tagged failure with no message is named by its tag, so the row reads and searches well.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- parsed by taggedErrorSchema right below
const taggedName = (error: unknown): string | null => {
    const parsed = taggedErrorSchema.safeParse(error)
    return parsed.success ? parsed.data._tag : null
}

export const buildLogRow = ({
    level,
    prefix,
    message,
    metadata,
    error,
    userId,
}: LogProps): LogRow => {
    const combined: LogMetadata = { ...(metadata && serializeLogMetadata(metadata)) }
    if (error !== undefined) combined.error = serializeLogValue(error)

    return {
        project: 'roxcoach',
        level: level === 'log' ? 'debug' : level,
        prefix,
        message: message ?? taggedName(error),
        metadata: Object.keys(combined).length > 0 ? combined : null,
        user_id: userId ?? null,
    }
}

// Production persists by default. The flag turns it on elsewhere (a `trigger dev` or local run
// that should write to the shared table) or off in production.
export const shouldPersistLogs = (nodeEnv: string, flag?: boolean): boolean =>
    flag ?? nodeEnv === 'production'

const messageOf = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

// Persisting must never break the caller: every failure ends in `reportFailure`, with the message
// only, never the row.
export function createLogWriter({
    enabled,
    insert,
    schedule,
    reportFailure,
}: LogWriterDependencies) {
    const persist = async (props: LogProps): Promise<void> => {
        if (!enabled) return
        try {
            await insert(buildLogRow(props))
        } catch (cause) {
            reportFailure(messageOf(cause))
        }
    }

    const log = (props: LogProps): void => {
        if (!enabled) return
        try {
            schedule(() => persist(props))
        } catch (cause) {
            reportFailure(messageOf(cause))
        }
    }

    return { log, persist }
}
