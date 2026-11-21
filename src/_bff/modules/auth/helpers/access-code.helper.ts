import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

/**
 * Compares the submitted access code with the expected one in constant time. Both sides are hashed
 * first, so the comparison does not leak the length or a matching prefix. The input is trimmed.
 * @param input - The code the user typed.
 * @param expected - The configured code.
 */
export const isValidAccessCode = (input: string, expected: string): boolean =>
    expected.length > 0 && timingSafeEqual(digest(input.trim()), digest(expected))
