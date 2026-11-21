import * as React from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(callback: () => void) {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY)
    mql.addEventListener('change', callback)
    return () => mql.removeEventListener('change', callback)
}

// True when the user asked the system to reduce motion. False on the server.
export function usePrefersReducedMotion() {
    return React.useSyncExternalStore(
        subscribe,
        () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
        () => false
    )
}
