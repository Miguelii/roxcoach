import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    cacheComponents: true,
    partialPrefetching: true,
    reactCompiler: true,
    images: {
        remotePatterns: [
            new URL('https://lyfta.app/images/exercises/**'),
            new URL('https://apilyfta.com/static/GymvisualPNG/**'),
        ],
        maximumRedirects: 0,
        minimumCacheTTL: 31536000,
    },
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'Referrer-Policy', value: 'no-referrer' },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000; includeSubDomains; preload',
                    },
                    { key: 'X-Xss-Protection', value: '0' },
                    // The microphone is allowed on our own origin for the coach voice input.
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=()',
                    },
                ],
            },
        ]
    },
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
