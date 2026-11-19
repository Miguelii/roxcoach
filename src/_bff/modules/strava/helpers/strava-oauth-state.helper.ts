import 'server-only'

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { STRAVA_STATE_COOKIE_PATH } from '@/_bff/modules/strava/constants'

type StateCookieOptions = {
    httpOnly: true
    sameSite: 'lax'
    secure: boolean
    path: string
    maxAge: number
}

const STATE_BYTES = 32

// A fresh CSRF state for one OAuth round trip: 32 random bytes as hex.
export const createOAuthState = () => randomBytes(STATE_BYTES).toString('hex')

// Constant-time comparison of the returned state with its cookie. A missing or empty value never
// matches, and values of different lengths are rejected before `timingSafeEqual` (which throws on
// unequal lengths). The state length is fixed and public, so the length check leaks nothing.
export const oauthStatesMatch = (received: string | null, expected: string | null): boolean => {
    if (!received || !expected) return false
    const a = Buffer.from(received, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}

// Options shared by the cookie set at connect and the one clearing it in the callback (maxAge 0).
// NODE_ENV is set by Next.js itself and inlined at build time, so it is not part of the t3 env.
export const stateCookieOptions = (maxAge: number): StateCookieOptions => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: STRAVA_STATE_COOKIE_PATH,
    maxAge,
})
