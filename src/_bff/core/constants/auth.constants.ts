// The login page. Signed-in users with access are sent away from it.
export const AUTH_PAGE_PATH = '/login'

// The sign-up page (access code). Public like the login page.
export const SIGNUP_PAGE_PATH = '/signup'

// The public pages. Signed-in users with access are sent away from them.
export const PUBLIC_AUTH_PATHS: string[] = [AUTH_PAGE_PATH, SIGNUP_PAGE_PATH]

// Where a user with access lands after login, and the fallback for unsafe return paths.
export const DEFAULT_POST_AUTH_PATH = '/dashboard'

// Path prefixes that require `app_metadata.roxcoach === true`. Matched on a path-segment boundary.
export const PROTECTED_PATHS: string[] = [
    '/dashboard',
    '/calendar',
    '/activities',
    '/races',
    '/settings',
]
