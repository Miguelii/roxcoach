// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    createOAuthState,
    oauthStatesMatch,
    stateCookieOptions,
} from '@/_bff/modules/strava/helpers/strava-oauth-state.helper'

describe('createOAuthState', () => {
    it('returns 32 random bytes as 64 lowercase hex characters, different on every call', () => {
        const first = createOAuthState()
        const second = createOAuthState()

        expect(first).toMatch(/^[0-9a-f]{64}$/u)
        expect(second).toMatch(/^[0-9a-f]{64}$/u)
        expect(first).not.toBe(second)
    })
})

describe('oauthStatesMatch', () => {
    const STATE = 'a'.repeat(64)

    it('accepts an identical state', () => {
        expect(oauthStatesMatch(STATE, STATE)).toBe(true)
    })

    it.each([
        ['a different state of the same length', 'b'.repeat(64), STATE],
        ['a shorter state', 'a'.repeat(63), STATE],
        ['a longer state', 'a'.repeat(65), STATE],
        ['a missing received state', null, STATE],
        ['a missing cookie', STATE, null],
        ['two empty values', '', ''],
        ['two missing values', null, null],
    ])('rejects %s without throwing', (_label, received, expected) => {
        expect(oauthStatesMatch(received, expected)).toBe(false)
    })
})

describe('stateCookieOptions', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('is httpOnly, lax, scoped to /api/strava and lives for the given seconds', () => {
        vi.stubEnv('NODE_ENV', 'development')

        expect(stateCookieOptions(600)).toEqual({
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/api/strava',
            maxAge: 600,
        })
    })

    it('is secure in production', () => {
        vi.stubEnv('NODE_ENV', 'production')

        expect(stateCookieOptions(0).secure).toBe(true)
    })
})
