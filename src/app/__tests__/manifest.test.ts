// @vitest-environment node
/* oxlint-disable no-await-in-loop -- icons are read one at a time */
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'

const PUBLIC_DIR = new URL('../../../public/', import.meta.url)
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

describe('web app manifest', () => {
    const app = manifest()

    it('is installable: a name, a start page inside the scope, and a standalone display', () => {
        expect(app.name).toBe('Roxcoach')
        expect(app.short_name).toBe('Roxcoach')
        expect(app.display).toBe('standalone')
        expect(app.start_url).toBe('/dashboard')
        expect(app.scope).toBe('/')
        expect(app.start_url?.startsWith(app.scope ?? '/')).toBe(true)
    })

    it('uses the paper color of the design system for the background and the theme', () => {
        expect(app.background_color).toBe('#f7f4ee')
        expect(app.theme_color).toBe('#f7f4ee')
    })

    it('has a 192 and a 512 icon, and a maskable one', () => {
        const icons = app.icons ?? []

        expect(icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any')).toBe(true)
        expect(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true)
        expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
    })

    it('points every icon at a PNG that exists in public', async () => {
        for (const icon of app.icons ?? []) {
            const bytes = await readFile(new URL(icon.src.slice(1), PUBLIC_DIR))
            expect([...bytes.subarray(0, 4)]).toEqual(PNG_SIGNATURE)
        }
    })

    it('ships the apple touch icon the layout links to', async () => {
        const bytes = await readFile(new URL('apple-touch-icon.png', PUBLIC_DIR))

        expect([...bytes.subarray(0, 4)]).toEqual(PNG_SIGNATURE)
    })
})
