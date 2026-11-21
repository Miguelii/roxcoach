import { describe, expect, it } from 'vitest'
import { PROTECTED_PATHS } from '@/_bff/core/constants/auth.constants'
import { decideAuthRedirect } from '@/_bff/core/helpers/auth-redirect.helper'

describe('decideAuthRedirect', () => {
    it('exposes the protected paths', () => {
        expect(PROTECTED_PATHS).toEqual([
            '/dashboard',
            '/calendar',
            '/activities',
            '/races',
            '/settings',
        ])
    })

    it.each(PROTECTED_PATHS)('sends %s to /login without access', (path) => {
        expect(decideAuthRedirect({ pathname: path, hasAccess: false })).toBe('/login')
    })

    it.each(PROTECTED_PATHS)('sends nested paths under %s to /login without access', (path) => {
        expect(decideAuthRedirect({ pathname: `${path}/nested/1`, hasAccess: false })).toBe(
            '/login'
        )
        expect(decideAuthRedirect({ pathname: `${path}/`, hasAccess: false })).toBe('/login')
    })

    it.each(PROTECTED_PATHS)('lets %s through with access', (path) => {
        expect(decideAuthRedirect({ pathname: path, hasAccess: true })).toBeNull()
        expect(decideAuthRedirect({ pathname: `${path}/nested`, hasAccess: true })).toBeNull()
    })

    it('protects /calendar: signed out and no flag go to /login, the flag passes', () => {
        expect(decideAuthRedirect({ pathname: '/calendar', hasAccess: false })).toBe('/login')
        expect(decideAuthRedirect({ pathname: '/calendar/2026-11', hasAccess: false })).toBe(
            '/login'
        )
        expect(decideAuthRedirect({ pathname: '/calendar', hasAccess: true })).toBeNull()
    })

    it('sends /login to /dashboard with access', () => {
        expect(decideAuthRedirect({ pathname: '/login', hasAccess: true })).toBe('/dashboard')
    })

    it('keeps /login without access', () => {
        expect(decideAuthRedirect({ pathname: '/login', hasAccess: false })).toBeNull()
    })

    it.each(['/signup', '/signup/', '/signup/extra', '/%73ignup'])(
        'sends %s to /dashboard with access',
        (pathname) => {
            expect(decideAuthRedirect({ pathname, hasAccess: true })).toBe('/dashboard')
        }
    )

    it.each(['/signup', '/signup/'])('keeps %s without access (it is public)', (pathname) => {
        expect(decideAuthRedirect({ pathname, hasAccess: false })).toBeNull()
    })

    it.each([true, false])('keeps / (hasAccess %s)', (hasAccess) => {
        expect(decideAuthRedirect({ pathname: '/', hasAccess })).toBeNull()
    })

    it.each([
        '/calendarx',
        '/calendars',
        '/races-extra',
        '/dashboarding',
        '/loginx',
        '/signupx',
        '/settings-public',
    ])('only matches on a path-segment boundary: %s', (pathname) => {
        expect(decideAuthRedirect({ pathname, hasAccess: false })).toBeNull()
        expect(decideAuthRedirect({ pathname, hasAccess: true })).toBeNull()
    })

    it.each(['/%64ashboard', '/dashboard%2Fx', '/%63alendar'])(
        'matches percent-encoded protected paths: %s',
        (pathname) => {
            expect(decideAuthRedirect({ pathname, hasAccess: false })).toBe('/login')
        }
    )

    it('does not throw on a malformed percent-encoding', () => {
        expect(decideAuthRedirect({ pathname: '/dashboard/%E0%A4%A', hasAccess: false })).toBe(
            '/login'
        )
        expect(decideAuthRedirect({ pathname: '/%E0%A4%A', hasAccess: false })).toBeNull()
    })
})
