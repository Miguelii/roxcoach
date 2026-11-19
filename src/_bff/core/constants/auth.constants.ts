// The only public page. Signed-in users with access are sent away from it.
export const AUTH_PAGE_PATH = '/login'

// Where a user with access lands after login, and the fallback for unsafe return paths.
export const DEFAULT_POST_AUTH_PATH = '/dashboard'

// Path prefixes that require `app_metadata.roxcoach === true`. Matched on a path-segment boundary.
export const PROTECTED_PATHS: string[] = [
    '/dashboard',
    '/coach',
    '/activities',
    '/plan',
    '/races',
    '/settings',
]
