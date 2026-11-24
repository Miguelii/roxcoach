import { describe, expect, it } from 'vitest'
import { hasRoxcoachAccess, isRoxcoachAdmin } from '@/_bff/core/helpers/access.helper'

describe('hasRoxcoachAccess', () => {
    it('grants access only for the strict boolean flag', () => {
        expect(hasRoxcoachAccess({ app_metadata: { roxcoach: true } })).toBe(true)
    })

    it('ignores user_metadata next to the real flag', () => {
        expect(
            hasRoxcoachAccess({
                app_metadata: { roxcoach: true },
                user_metadata: { roxcoach: false },
            })
        ).toBe(true)
    })

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['an empty object', {}],
        ['empty app_metadata', { app_metadata: {} }],
        ['null app_metadata', { app_metadata: null }],
        ['a string flag', { app_metadata: { roxcoach: 'true' } }],
        ['a numeric flag', { app_metadata: { roxcoach: 1 } }],
        ['a false flag', { app_metadata: { roxcoach: false } }],
        ['a user_metadata flag only', { user_metadata: { roxcoach: true } }],
        [
            'a user_metadata flag with empty app_metadata',
            { app_metadata: {}, user_metadata: { roxcoach: true } },
        ],
        [
            'a user_metadata flag with a false app_metadata flag',
            { app_metadata: { roxcoach: false }, user_metadata: { roxcoach: true } },
        ],
        ['a null flag', { app_metadata: { roxcoach: null } }],
        ['an object flag', { app_metadata: { roxcoach: {} } }],
    ])('denies access for %s', (_label, subject) => {
        expect(hasRoxcoachAccess(subject)).toBe(false)
    })
})

describe('isRoxcoachAdmin', () => {
    it('is true only with both strict boolean flags', () => {
        expect(isRoxcoachAdmin({ app_metadata: { roxcoach: true, roxcoach_admin: true } })).toBe(
            true
        )
    })

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['access without the admin flag', { app_metadata: { roxcoach: true } }],
        ['the admin flag without access', { app_metadata: { roxcoach_admin: true } }],
        ['a false admin flag', { app_metadata: { roxcoach: true, roxcoach_admin: false } }],
        ['a string admin flag', { app_metadata: { roxcoach: true, roxcoach_admin: 'true' } }],
        ['a numeric admin flag', { app_metadata: { roxcoach: true, roxcoach_admin: 1 } }],
        [
            'a user_metadata admin flag',
            { app_metadata: { roxcoach: true }, user_metadata: { roxcoach_admin: true } },
        ],
    ])('is false for %s', (_label, subject) => {
        expect(isRoxcoachAdmin(subject)).toBe(false)
    })
})
