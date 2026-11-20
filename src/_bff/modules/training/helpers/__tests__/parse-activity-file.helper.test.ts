// @vitest-environment node
import { readFileSync } from 'node:fs'
import { Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { parseActivityFile } from '@/_bff/modules/training/helpers/parse-activity-file.helper'

const FIXTURES = new URL('./fixtures/', import.meta.url)
const run = (bytes: Uint8Array) => Effect.runSync(Effect.result(parseActivityFile(bytes)))

describe('parseActivityFile', () => {
    it('dispatches fit and tcx by content', () => {
        const fit = run(new Uint8Array(readFileSync(new URL('zepp-hyrox-test.fit', FIXTURES))))
        const tcx = run(new Uint8Array(readFileSync(new URL('zepp-hyrox-test.tcx', FIXTURES))))
        if (Result.isFailure(fit) || Result.isFailure(tcx)) throw new Error('expected success')
        expect(fit.success.format).toBe('fit')
        expect(tcx.success.format).toBe('tcx')
    })

    it('dispatches gpx by content', () => {
        const xml = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="0" lon="0"><time>2026-01-01T10:00:00Z</time></trkpt></trkseg></trk></gpx>`
        const result = run(new TextEncoder().encode(xml))
        if (Result.isFailure(result)) throw new Error('expected success')
        expect(result.success.format).toBe('gpx')
    })

    it('rejects unknown content', () => {
        const result = run(new TextEncoder().encode('hello there'))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result))
            expect(result.failure._tag).toBe('UnsupportedActivityFileError')
    })
})
