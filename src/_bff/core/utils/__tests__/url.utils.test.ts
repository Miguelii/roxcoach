import { describe, expect, it } from 'vitest'
import { normalizeWebsiteUrl } from '@/_bff/core/utils/url.utils'

describe('normalizeWebsiteUrl', () => {
    it('defaults to localhost when no url is given', () => {
        expect(normalizeWebsiteUrl()).toBe('http://localhost:3000')
    })

    it('strips a single trailing slash', () => {
        expect(normalizeWebsiteUrl('https://roxcoach.app/')).toBe('https://roxcoach.app')
    })

    it('leaves a url without a trailing slash unchanged', () => {
        expect(normalizeWebsiteUrl('https://roxcoach.app')).toBe('https://roxcoach.app')
    })
})
