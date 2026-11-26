import type { NextResponse } from 'next/server'

const DEFAULT_CACHE_CONTROL = 'private, no-cache, no-store, must-revalidate'

/**
 * Sets the page Content-Security-Policy on a proxy response, and a private no-store
 * Cache-Control unless one is already present.
 * Only runs for page/document requests: static assets are excluded from the
 * proxy via matcher.
 * @param response - The proxy response to decorate.
 */
export const setCSP = (response: NextResponse) => {
    response.headers.set('Content-Security-Policy', generateCSP())
    // Keep a Cache-Control set upstream (Supabase's no-store on session refresh). Every page except
    // /login is per-user, so the default must never allow shared caching either.
    if (!response.headers.has('Cache-Control')) {
        response.headers.set('Cache-Control', DEFAULT_CACHE_CONTROL)
    }

    return response
}

const generateCSP = () => {
    // 'unsafe-eval' is only required in development (React Fast Refresh)
    const scriptEvalDirective =
        process.env.NODE_ENV === 'development' ? "'unsafe-eval' 'wasm-unsafe-eval'" : ''

    // The coach voice input streams audio from the browser straight to Gemini Live.
    const csp = `
        default-src 'self';
        style-src 'self' 'unsafe-inline';
        script-src 'self' 'unsafe-inline' ${scriptEvalDirective};
        img-src 'self' blob: data:;
        font-src 'self';
        frame-src 'self';
        object-src 'none';
        media-src 'self';
        base-uri 'self';
        connect-src 'self' wss://generativelanguage.googleapis.com;
        worker-src 'self';
        form-action 'self';
        frame-ancestors 'none';
        upgrade-insecure-requests;
    `

    return csp.replaceAll(/\s{2,}/gu, ' ').trim()
}
