import {
    ADMIN_PATHS,
    AUTH_PAGE_PATH,
    DEFAULT_POST_AUTH_PATH,
    PROTECTED_PATHS,
    PUBLIC_AUTH_PATHS,
} from '@/_bff/core/constants/auth.constants'

type AuthRedirectInput = { pathname: string; hasAccess: boolean; isAdmin: boolean }

// Decodes once so `/%64ashboard` is matched like `/dashboard`. A malformed encoding keeps the raw path.
const decodePath = (pathname: string): string => {
    try {
        return decodeURIComponent(pathname)
    } catch {
        return pathname
    }
}

// True when `pathname` is `prefix` itself or a path below it (`/plan/1` matches `/plan`, `/plans` does not).
const isUnder = (pathname: string, prefix: string): boolean =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)

const isAdminPath = (pathname: string): boolean =>
    ADMIN_PATHS.some((prefix) => isUnder(pathname, prefix))

const isProtected = (pathname: string): boolean =>
    isAdminPath(pathname) || PROTECTED_PATHS.some((prefix) => isUnder(pathname, prefix))

/**
 * Decides where the proxy must redirect a request, or `null` to let it through.
 * A user without the roxcoach flag counts as signed out on protected paths, and a user without the
 * admin flag is sent away from admin paths.
 * @param input - The request pathname and whether the session carries the access and admin flags.
 */
export const decideAuthRedirect = ({
    pathname,
    hasAccess,
    isAdmin,
}: AuthRedirectInput): string | null => {
    const candidates = [pathname, decodePath(pathname)]

    if (!hasAccess && candidates.some((path) => isProtected(path))) return AUTH_PAGE_PATH

    if (!isAdmin && candidates.some((path) => isAdminPath(path))) return DEFAULT_POST_AUTH_PATH

    if (
        hasAccess &&
        candidates.some((path) => PUBLIC_AUTH_PATHS.some((prefix) => isUnder(path, prefix)))
    ) {
        return DEFAULT_POST_AUTH_PATH
    }

    return null
}
