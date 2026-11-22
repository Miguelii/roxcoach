import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

// Route handlers under /api are not pages. Protected pages redirect crawlers to /login.
export default function robots(): MetadataRoute.Robots {
    return {
        rules: { userAgent: '*', allow: '/', disallow: '/api/' },
        sitemap: `${SITE_URL}/sitemap.xml`,
    }
}
