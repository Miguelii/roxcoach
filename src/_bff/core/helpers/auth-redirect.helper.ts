import {
    AUTH_PAGE_PATH,
    DEFAULT_POST_AUTH_PATH,
    PROTECTED_PATHS,
} from '@/_bff/core/constants/auth.constants'

type AuthRedirectInput = { pathname: string; hasAccess: boolean }

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

const isProtected = (pathname: string): boolean =>
    PROTECTED_PATHS.some((prefix) => isUnder(pathname, prefix))

/**
 * Decides where the proxy must redirect a request, or `null` to let it through.
 * A user without the roxcoach flag counts as signed out on protected paths.
 * @param input - The request pathname and whether the session carries the access flag.
 */
export const decideAuthRedirect = ({ pathname, hasAccess }: AuthRedirectInput): string | null => {
    const candidates = [pathname, decodePath(pathname)]

    if (!hasAccess && candidates.some((path) => isProtected(path))) return AUTH_PAGE_PATH

    if (hasAccess && candidates.some((path) => isUnder(path, AUTH_PAGE_PATH))) {
        return DEFAULT_POST_AUTH_PATH
    }

    return null
}
