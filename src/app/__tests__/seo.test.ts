// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { SITE_METADATA, SITE_URL } from '@/lib/seo'

const PUBLIC_DIR = new URL('../../../public/', import.meta.url)
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const SHARE_IMAGE_PATH = '/assets/brag.jpg'

describe('site metadata', () => {
    it('is indexable and resolves relative URLs against the website URL', () => {
        expect(SITE_METADATA.robots).toEqual({ index: true, follow: true })
        expect(SITE_METADATA.metadataBase?.toString()).toBe(new URL(SITE_URL).toString())
    })

    it('shares the README video poster on Open Graph and X', () => {
        const image = { url: SHARE_IMAGE_PATH, width: 1920, height: 1080 }

        expect(SITE_METADATA.openGraph).toMatchObject({ images: [image] })
        expect(SITE_METADATA.twitter).toMatchObject({
            card: 'summary_large_image',
            images: [image],
        })
    })

    it('keeps the description within the length search engines show', () => {
        expect(String(SITE_METADATA.description).length).toBeLessThanOrEqual(160)
    })

    it('points the share image at a real JPEG in public/', async () => {
        const bytes = await readFile(new URL(`.${SHARE_IMAGE_PATH}`, PUBLIC_DIR))

        expect([...bytes.subarray(0, 3)]).toEqual(JPEG_SIGNATURE)
    })
})

describe('robots and sitemap', () => {
    it('lets crawlers in, keeps them out of /api and links the sitemap', () => {
        const file = robots()

        expect(file.rules).toEqual({ userAgent: '*', allow: '/', disallow: '/api/' })
        expect(file.sitemap).toBe(`${SITE_URL}/sitemap.xml`)
    })

    it('lists only the public sign-in page', () => {
        expect(sitemap().map((entry) => entry.url)).toEqual([`${SITE_URL}/login`])
    })
})
