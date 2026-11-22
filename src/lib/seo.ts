import type { Metadata } from 'next'
import { ClientEnv } from '@/env/client'

const SITE_NAME = 'Roxcoach'

const SITE_DESCRIPTION =
    'Open source training coach for Hyrox and running: one calendar for all workouts, running and strength progress, race readiness and a coach that knows your data.'

// The poster of the README video, 1920x1080.
const SHARE_IMAGE = {
    url: '/assets/brag.jpg',
    width: 1920,
    height: 1080,
    alt: 'Roxcoach, a training coach for endurance and strength athletes',
}

export const SITE_URL = ClientEnv.NEXT_PUBLIC_WEBSITE_URL

export const SITE_METADATA: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: [
        'Hyrox',
        'running',
        'strength training',
        'training log',
        'race readiness',
        'AI coach',
        'open source',
    ],
    category: 'sports',
    robots: { index: true, follow: true },
    icons: { apple: '/apple-touch-icon.png' },
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'default' },
    openGraph: {
        type: 'website',
        siteName: SITE_NAME,
        locale: 'en_US',
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        images: [SHARE_IMAGE],
    },
    twitter: {
        card: 'summary_large_image',
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        images: [SHARE_IMAGE],
    },
}
