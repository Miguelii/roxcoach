import { z } from 'zod'
import { DEFAULT_POST_AUTH_PATH } from '@/_bff/core/constants/auth.constants'

// Shape of a Next search param value, the usual source of a return path.
type ReturnToInput = string | string[] | null | undefined

// Only a non-empty string can be a return path.
const ReturnToSchema = z.string().min(1)

// Enough rounds for any legitimate value; a value still changing after this is rejected.
const MAX_DECODE_ROUNDS = 5

// Placeholder origin used only to check that a path resolves on the same site.
const PROBE_ORIGIN = 'https://roxcoach.invalid'

// Last ASCII control character before space, plus DEL.
const LAST_CONTROL_CODE = 0x1f
const DEL_CODE = 0x7f

// Browsers strip tabs and newlines from URLs, so `/\t/evil.com` would become `//evil.com`.
const hasControlChar = (value: string): boolean =>
    [...value].some((char) => {
        const code = char.codePointAt(0) ?? 0
        return code <= LAST_CONTROL_CODE || code === DEL_CODE
    })

// Fully decodes repeated percent-encoding (`%252F` to `/`). Returns null when malformed or unbounded.
const decodeFully = (value: string): string | null => {
    let current = value
    for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
        let next: string
        try {
            next = decodeURIComponent(current)
        } catch {
            return null
        }
        if (next === current) return current
        current = next
    }
    return null
}

// A same-site absolute path: one leading slash, no backslash, no control character, same origin.
const isSameSitePath = (value: string): boolean => {
    if (!value.startsWith('/') || value.startsWith('//')) return false
    if (value.includes('\\') || hasControlChar(value)) return false
    const resolved = new URL(value, PROBE_ORIGIN)
    // Dot segments can collapse into a protocol-relative path: `/.//evil.com` resolves to `//evil.com`.
    return resolved.origin === PROBE_ORIGIN && !resolved.pathname.startsWith('//')
}

/**
 * Returns `returnTo` when it is a same-site absolute path, otherwise `fallback`.
 * Both the raw value and its fully decoded form must pass, which rejects protocol-relative,
 * backslash, absolute and `javascript:` forms, including percent-encoded and double-encoded ones.
 * @param returnTo - The untrusted return path, usually from a query parameter. Non-strings give `fallback`.
 * @param fallback - Path used when `returnTo` is missing or unsafe.
 */
export const safeReturnTo = (
    returnTo: ReturnToInput,
    fallback: string = DEFAULT_POST_AUTH_PATH
): string => {
    // Next search params can be `string[]`, and untyped callers may pass anything else.
    const parsed = ReturnToSchema.safeParse(returnTo)
    if (!parsed.success) return fallback
    const raw = parsed.data

    const decoded = decodeFully(raw)
    if (decoded === null) return fallback

    return isSameSitePath(raw) && isSameSitePath(decoded) ? raw : fallback
}
