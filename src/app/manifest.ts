import type { MetadataRoute } from 'next'

// The web app manifest that makes Roxcoach installable on a home screen. The icons are in
// `public/` (names the proxy matcher already lets through without a session). Push notifications
// and offline caching are not part of this: it only needs the manifest and HTTPS to be installable.
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: '/dashboard',
        name: 'Roxcoach',
        short_name: 'Roxcoach',
        description: 'A personal training assistant for Hyrox and running.',
        lang: 'en',
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f4ee',
        theme_color: '#f7f4ee',
        categories: ['sports', 'health', 'fitness'],
        icons: [
            {
                src: '/android-chrome-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/android-chrome-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/android-chrome-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    }
}
