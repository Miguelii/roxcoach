import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    cacheComponents: true,
    partialPrefetching: true,
    reactCompiler: true,
    // `/` only forwards to the dashboard. A config redirect avoids rendering a page just to throw
    // NEXT_REDIRECT, which breaks Cache Components instant validation. The proxy then sends
    // signed-out visitors from /dashboard to /login.
    redirects() {
        return [{ source: '/', destination: '/dashboard', permanent: false }]
    },
    turbopack: {
        rules: {
            '*.css': {
                loaders: ['@tailwindcss/turbopack'],
                as: '*.css',
            },
        },
    },
}

export default nextConfig
