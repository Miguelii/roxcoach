import { z } from 'zod'

// JSON-safe value printed to the console
export type LogValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | LogValue[]
    | { [key: string]: LogValue }

export type LogMetadata = { [key: string]: LogValue }

const REDACTED = '[redacted]'
const TRUNCATED = '[truncated]'
const CIRCULAR = '[circular]'
const MAX_DEPTH = 8

// A key whose normalized form (lowercase, without "-", "_" or whitespace) contains any of these
// has its value replaced. Normalizing makes `x-api-key`, `api_key`, `apiKey` and `API KEY` the same.
const SENSITIVE_KEY_PARTS = [
    'password',
    'passwd',
    'token',
    'secret',
    'authorization',
    'cookie',
    'apikey',
    'privatekey',
    'credential',
    'bearer',
    'servicerole',
    'jwt',
]

const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean()])

const isSensitiveKey = (key: string) => {
    const normalized = key.toLowerCase().replaceAll(/[-_\s]/gu, '')
    return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
}

const serializeEntries = (
    entries: [string, unknown][],
    depth: number,
    seen: WeakSet<object>
): LogMetadata =>
    Object.fromEntries(
        entries.map(([key, value]) => [
            key,
            isSensitiveKey(key) ? REDACTED : serialize(value, depth + 1, seen),
        ])
    )

// Decodes whatever was thrown or logged into a JSON-safe value with sensitive keys redacted.
// `seen` holds every object already visited in this log call: a second visit (a cycle, or a
// reference shared by two parents) prints `[circular]`, which keeps the output linear in the size
// of the graph. The depth limit is a second guard for very deep, acyclic structures.
function serialize(cause: unknown, depth: number, seen: WeakSet<object>): LogValue {
    if (cause == null) return cause
    if (depth > MAX_DEPTH) return TRUNCATED

    const primitive = PrimitiveSchema.safeParse(cause)
    if (primitive.success) return primitive.data

    if (!(cause instanceof Object)) return String(cause)

    if (seen.has(cause)) return CIRCULAR
    seen.add(cause)

    if (Array.isArray(cause)) return cause.map((item) => serialize(item, depth + 1, seen))

    if (cause instanceof Error) {
        // Own enumerable fields (tagged errors) first, then the standard fields. `cause` is
        // read through the property because it can be non-enumerable.
        const { stack: _stack, ...fields } = cause
        return {
            ...serializeEntries(Object.entries(fields), depth, seen),
            name: cause.name,
            message: cause.message || String(cause),
            cause: cause.cause === undefined ? undefined : serialize(cause.cause, depth + 1, seen),
            stack: cause.stack?.split('\n').slice(0, 4).join('\n'),
        }
    }

    // Arrays and errors are handled above, so this is a plain or class-instance object
    return serializeEntries(Object.entries(cause), depth, seen)
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- decodes whatever was thrown or logged
export const serializeLogValue = (value: unknown): LogValue => serialize(value, 0, new WeakSet())

export const serializeLogMetadata = (
    metadata: LogMetadata,
    seen = new WeakSet<object>()
): LogMetadata => serializeEntries(Object.entries(metadata), 0, seen)
