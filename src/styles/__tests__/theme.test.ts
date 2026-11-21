import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLES_DIR = path.resolve(import.meta.dirname, '..')

function readStyle(name: string) {
    return readFileSync(path.join(STYLES_DIR, name), 'utf8')
}

function rootVariables() {
    const root = /:root\s*{([\s\S]*?)\n}/.exec(readStyle('theme.css'))?.[1] ?? ''
    const variables = new Map<string, string>()
    for (const match of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        variables.set(match[1], match[2].trim())
    }
    return variables
}

function toneBlock(tone: string) {
    const css = readStyle('tone.css')
    return new RegExp(`\\[data-tone='${tone}'\\]\\s*{([^}]*)}`).exec(css)?.[1] ?? ''
}

function hex(name: string) {
    const value = rootVariables().get(name)
    if (!value) throw new Error(`Missing token ${name}`)
    return value.toLowerCase()
}

function channels(color: string, over = '#ffffff'): number[] {
    const rgba = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(color)
    if (rgba) {
        const alpha = Number(rgba[4])
        const base = channels(over)
        return [1, 2, 3].map((i) => Number(rgba[i]) * alpha + base[i - 1] * (1 - alpha))
    }
    return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
}

function luminance(color: string, over?: string) {
    const lin = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const [r, g, b] = channels(color, over).map(lin)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string, over?: string) {
    const [hi, lo] = [luminance(a, over), luminance(b, over)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}

const HUES = ['signal', 'blue', 'plum', 'slate', 'amber', 'green', 'red']

describe('Soft Studio tokens', () => {
    it('defines the Soft Studio neutrals', () => {
        expect(hex('--paper')).toBe('#f5f5f3')
        expect(hex('--card')).toBe('#ffffff')
        expect(hex('--sunken')).toBe('#ebebe8')
        expect(hex('--ink')).toBe('#121214')
    })

    it('defines every hue triplet', () => {
        const variables = rootVariables()
        for (const hue of HUES) {
            expect(variables.has(`--${hue}`)).toBe(true)
            expect(variables.has(`--${hue}-soft`)).toBe(true)
            expect(variables.has(`--${hue}-deep`)).toBe(true)
        }
        expect(hex('--signal')).toBe('#ff5b2e')
        expect(hex('--signal-strong')).toBe('#cc3d15')
        expect(hex('--red')).toBe('#d92d2d')
    })

    it('keeps white text at AA on every filled surface', () => {
        for (const name of [
            '--signal-strong',
            '--blue',
            '--red',
            '--slate',
            '--plum-deep',
            '--green-deep',
        ]) {
            expect(contrast('#ffffff', hex(name))).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('keeps deep text at AA on soft surfaces', () => {
        for (const hue of HUES) {
            expect(contrast(hex(`--${hue}-deep`), hex(`--${hue}-soft`))).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('keeps muted text at AA on paper and card', () => {
        const muted = rootVariables().get('--muted-foreground') ?? ''
        for (const ground of [hex('--paper'), hex('--card')]) {
            expect(contrast(muted, ground, ground)).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('fills plum and green tones with their deep shade', () => {
        expect(toneBlock('plum')).toContain('--tone: var(--plum-deep)')
        expect(toneBlock('green')).toContain('--tone: var(--green-deep)')
        expect(toneBlock('signal')).toContain('--tone: var(--signal-strong)')
    })

    it('defines the elevation, radius and motion tokens', () => {
        const variables = rootVariables()
        expect(variables.has('--shadow-soft')).toBe(true)
        expect(variables.has('--shadow-lift')).toBe(true)
        expect(variables.get('--ease-spring')).toBe('cubic-bezier(0.32, 0.72, 0, 1)')
        expect(variables.get('--radius')).toMatch(/^(16px|1rem)$/)
        expect(variables.get('--radius-surface-inner')).toBe('22px')
    })
})

function classBlock(css: string, selector: string) {
    const escaped = selector.replace(/[.]/g, '\\.')
    return new RegExp(`${escaped}\\s*{([^}]*)}`).exec(css)?.[1] ?? ''
}

describe('Soft Studio typography', () => {
    it('uses Outfit for sans and display', () => {
        const font = readStyle('font.css')
        expect(font).toMatch(/--font-sans:\s*var\(--font-outfit\)/)
        expect(font).toMatch(/--font-display:\s*var\(--font-outfit\)/)
        expect(font).not.toMatch(/anton|geist-sans/i)
    })

    it('keeps display titles in sentence case', () => {
        const display = classBlock(readStyle('globals.css'), '.display')
        expect(display).not.toContain('uppercase')
        expect(display).toContain('font-weight: 600')
    })

    it('defines the type scale and drops the old display sizes', () => {
        const globals = readStyle('globals.css')
        for (const name of [
            '.display',
            '.type-display',
            '.type-title',
            '.type-heading',
            '.type-subheading',
            '.type-metric',
            '.type-metric-xl',
            '.eyebrow',
        ]) {
            expect(classBlock(globals, name)).not.toBe('')
        }
        for (const gone of [
            '.display-giant',
            '.display-hero',
            '.display-card',
            '.display-section',
        ]) {
            expect(globals).not.toContain(gone)
        }
    })
})
