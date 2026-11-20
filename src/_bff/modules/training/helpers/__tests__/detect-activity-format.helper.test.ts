// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectActivityFormat } from '@/_bff/modules/training/helpers/detect-activity-format.helper'

const FIXTURES = new URL('./fixtures/', import.meta.url)
const read = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)))
const text = (value: string) => new TextEncoder().encode(value)

describe('detectActivityFormat', () => {
    it('detects the real FIT file', () => {
        expect(detectActivityFormat(read('zepp-hyrox-test.fit'))).toBe('fit')
    })

    it('detects the real TCX file', () => {
        expect(detectActivityFormat(read('zepp-hyrox-test.tcx'))).toBe('tcx')
    })

    it('detects a minimal GPX', () => {
        expect(detectActivityFormat(text('<gpx version="1.1"></gpx>'))).toBe('gpx')
    })

    it('tolerates a BOM and leading whitespace', () => {
        const bom = new Uint8Array([0xef, 0xbb, 0xbf])
        const body = text('\n  <?xml version="1.0"?><gpx></gpx>')
        expect(detectActivityFormat(new Uint8Array([...bom, ...body]))).toBe('gpx')
    })

    it('returns null for plain text and empty input', () => {
        expect(detectActivityFormat(text('hello world'))).toBeNull()
        expect(detectActivityFormat(new Uint8Array())).toBeNull()
    })

    it('ignores the file name: FIT bytes stay fit', () => {
        const trackGpx = read('zepp-hyrox-test.fit')
        expect(detectActivityFormat(trackGpx)).toBe('fit')
    })
})
