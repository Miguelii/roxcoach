import { describe, expect, it } from 'vitest'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'

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
