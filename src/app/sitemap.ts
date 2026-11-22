import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

// Only /login is public and indexable: every other page needs a session, and /signup is noindex.
export default function sitemap(): MetadataRoute.Sitemap {
    return [{ url: `${SITE_URL}/login`, changeFrequency: 'monthly', priority: 1 }]
}
