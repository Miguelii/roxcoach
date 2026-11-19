import { describe, expect, it } from 'vitest'
import { safeReturnTo } from '@/_bff/core/helpers/safe-redirect.helper'

describe('safeReturnTo', () => {
    it.each(['/plan', '/races?x=1', '/dashboard', '/activities/42#top', '/plan?next=%2Fraces'])(
        'accepts the same-site path %s',
        (returnTo) => {
            expect(safeReturnTo(returnTo)).toBe(returnTo)
        }
    )

    it.each([
        ['protocol-relative', '//evil.com'],
        ['triple slash', '///evil.com'],
        ['backslash', '/\\evil.com'],
        ['leading backslash', '\\\\evil.com'],
        ['absolute https', 'https://evil.com'],
        ['absolute http', 'http://evil.com/plan'],
        ['javascript', 'javascript:alert(1)'],
        ['uppercase javascript', 'JavaScript:alert(1)'],
        ['data URL', 'data:text/html,hi'],
        ['encoded protocol-relative', '%2F%2Fevil.com'],
        ['encoded second slash', '/%2Fevil.com'],
        ['encoded backslash', '/%5Cevil.com'],
        ['double-encoded protocol-relative', '%252F%252Fevil.com'],
        ['double-encoded second slash', '/%252Fevil.com'],
        ['double-encoded backslash', '/%255Cevil.com'],
        ['encoded javascript', 'javascript%3Aalert(1)'],
        ['tab inside slashes', '/\t/evil.com'],
        ['encoded tab inside slashes', '/%09/evil.com'],
        ['newline inside slashes', '/\n/evil.com'],
        ['relative path', 'plan'],
        ['malformed encoding', '/plan%E0%A4%A'],
        ['empty', ''],
        ['whitespace', '   '],
        ['null', null],
        ['undefined', undefined],
    ])('falls back for %s', (_label, returnTo) => {
        expect(safeReturnTo(returnTo)).toBe('/dashboard')
    })

    it('uses the given fallback', () => {
        expect(safeReturnTo('//evil.com', '/plan')).toBe('/plan')
        expect(safeReturnTo(null, '/races')).toBe('/races')
    })
})
