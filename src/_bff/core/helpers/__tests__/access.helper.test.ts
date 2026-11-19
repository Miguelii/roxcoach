import { describe, expect, it } from 'vitest'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'

describe('hasRoxcoachAccess', () => {
    it('grants access only for the strict boolean flag', () => {
        expect(hasRoxcoachAccess({ app_metadata: { roxcoach: true } })).toBe(true)
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
    ])('denies access for %s', (_label, subject) => {
        expect(hasRoxcoachAccess(subject)).toBe(false)
    })
})
