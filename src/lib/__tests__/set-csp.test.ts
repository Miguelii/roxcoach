import { NextResponse } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setCSP } from '@/lib/set-csp'

const getCsp = () => setCSP(NextResponse.next()).headers.get('Content-Security-Policy') ?? ''

describe('setCSP', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('sets a private no-store Cache-Control by default', () => {
        const response = setCSP(NextResponse.next())

        expect(response.headers.get('Cache-Control')).toBe(
            'private, no-cache, no-store, must-revalidate'
        )
    })

    it('keeps a Cache-Control already present on the response', () => {
        const response = NextResponse.next()
        response.headers.set('Cache-Control', 'private, max-age=0')

        expect(setCSP(response).headers.get('Cache-Control')).toBe('private, max-age=0')
    })

    it('returns the same response it received', () => {
        const response = NextResponse.next()

        expect(setCSP(response)).toBe(response)
    })

    it('emits a single-line policy without extra whitespace', () => {
        const csp = getCsp()

        expect(csp).not.toMatch(/\s{2,}|\n/u)
        expect(csp).toContain("default-src 'self';")
    })

    it('locks down framing, plugins and base URI', () => {
        const csp = getCsp()

        expect(csp).toContain("frame-ancestors 'none'")
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain("base-uri 'self'")
        expect(csp).toContain('upgrade-insecure-requests')
    })

    it('allows unsafe-eval only in development', () => {
        vi.stubEnv('NODE_ENV', 'development')
        expect(getCsp()).toContain("'unsafe-eval'")

        vi.stubEnv('NODE_ENV', 'production')
        expect(getCsp()).not.toContain("'unsafe-eval'")
    })
})
