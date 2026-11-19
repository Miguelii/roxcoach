import 'server-only'

import { z } from 'zod'

type LogLevel = 'log' | 'warn' | 'error' | 'info'

// JSON-safe value printed to the console
type LogValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | LogValue[]
    | { [key: string]: LogValue }

type LogMetadata = { [key: string]: LogValue }

type LogDetails = {
    timestamp: string
    userId?: string
    error?: LogValue
    metadata?: LogMetadata
}

type Props = {
    level: LogLevel
    prefix: string
    error?: unknown
    message?: string
    metadata?: LogMetadata
    userId?: string
}

const REDACTED = '[redacted]'
const TRUNCATED = '[truncated]'
const MAX_DEPTH = 8

// Case-insensitive substrings: a key containing any of them has its value replaced
const SENSITIVE_KEY_PARTS = [
    'password',
    'passwd',
    'token',
    'secret',
    'authorization',
    'cookie',
    'api_key',
    'apikey',
    'service_role',
    'jwt',
]

const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean()])

const isSensitiveKey = (key: string) => {
    const lower = key.toLowerCase()
    return SENSITIVE_KEY_PARTS.some((part) => lower.includes(part))
}

const serializeEntries = (entries: [string, unknown][], depth: number): LogMetadata =>
    Object.fromEntries(
        entries.map(([key, value]) => [
            key,
            isSensitiveKey(key) ? REDACTED : serialize(value, depth + 1),
        ])
    )

// Decodes whatever was thrown or logged into a JSON-safe value with sensitive keys redacted.
// The depth limit also protects against circular references.
function serialize(cause: unknown, depth = 0): LogValue {
    if (cause == null) return cause
    if (depth > MAX_DEPTH) return TRUNCATED

    const primitive = PrimitiveSchema.safeParse(cause)
    if (primitive.success) return primitive.data

    if (Array.isArray(cause)) return cause.map((item) => serialize(item, depth + 1))

    if (cause instanceof Error) {
        // Own enumerable fields (tagged errors) first, then the standard fields. `cause` is
        // read through the property because it can be non-enumerable.
        const { stack: _stack, ...fields } = cause
        return {
            ...serializeEntries(Object.entries(fields), depth),
            name: cause.name,
            message: cause.message || String(cause),
            cause: cause.cause === undefined ? undefined : serialize(cause.cause, depth + 1),
            stack: cause.stack?.split('\n').slice(0, 4).join('\n'),
        }
    }

    // Arrays and errors are handled above, so this is a plain or class-instance object
    return cause instanceof Object ? serializeEntries(Object.entries(cause), depth) : String(cause)
}

export function Logger(props: Props): void {
    const { level, prefix, error, message, metadata, userId } = props

    const header = message ? `[${prefix}] ${message}` : `[${prefix}]`
    const details: LogDetails = { timestamp: new Date().toISOString() }

    if (userId !== undefined) details.userId = userId

    if (error !== undefined) details.error = serialize(error)

    if (metadata !== undefined) details.metadata = serializeEntries(Object.entries(metadata), 0)

    console[level](header, details)
}
