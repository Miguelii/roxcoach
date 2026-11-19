import type { NextResponse } from 'next/server'

/**
 * Sets the page Content-Security-Policy and Cache-Control on a proxy response.
 * Only runs for page/document requests: static assets are excluded from the
 * proxy via matcher.
 * @param response - The proxy response to decorate.
 */
export const setCSP = (response: NextResponse) => {
    response.headers.set('Content-Security-Policy', generateCSP())
    response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate')

    return response
}

const generateCSP = () => {
    // 'unsafe-eval' is only required in development (React Fast Refresh)
    const scriptEvalDirective =
        process.env.NODE_ENV === 'development' ? "'unsafe-eval' 'wasm-unsafe-eval'" : ''

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
        connect-src 'self';
        worker-src 'self';
        form-action 'self';
        frame-ancestors 'none';
        upgrade-insecure-requests;
    `

    return csp.replaceAll(/\s{2,}/gu, ' ').trim()
}
