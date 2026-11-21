// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
    buildHrHistogram,
    parseHrHistogram,
} from '@/_bff/modules/training/helpers/build-hr-histogram.helper'
import type { HrSample } from '@/_bff/modules/training/types/progress'

const s = (
    tS: number,
    hr: number | null,
    distanceM: number | null,
    speedMps: number | null = null
): HrSample => ({ t: tS * 1000, hr, distanceM, speedMps })

describe('buildHrHistogram', () => {
    it('attributes each interval to the later point heart rate', () => {
        const h = buildHrHistogram([s(0, 150, 0), s(1, 150, 3), s(2, 151, 6)])
        expect(h).toEqual({
            v: 1,
            bins: [
                [150, 1, 3],
                [151, 1, 3],
            ],
        })
    })

    it('skips an 11 s gap and keeps a 10 s gap', () => {
        expect(buildHrHistogram([s(0, 150, 0), s(11, 150, 40)]).bins).toEqual([])
        expect(buildHrHistogram([s(0, 150, 0), s(10, 150, 40)]).bins).toEqual([[150, 10, 40]])
    })

    it('skips stopped intervals', () => {
        expect(buildHrHistogram([s(0, 150, 0), s(1, 150, 0)]).bins).toEqual([])
    })

    it('skips missing and out of range heart rates', () => {
        const h = buildHrHistogram([s(0, 150, 0), s(1, null, 3), s(2, 20, 6), s(3, 260, 9)])
        expect(h.bins).toEqual([])
    })

    it('falls back to speed, and skips without distance or speed', () => {
        expect(buildHrHistogram([s(0, 150, null), s(1, 150, null, 3)]).bins).toEqual([[150, 1, 3]])
        expect(buildHrHistogram([s(0, 150, null), s(1, 150, null)]).bins).toEqual([])
    })

    it('treats a negative distance delta as stopped', () => {
        expect(buildHrHistogram([s(0, 150, 10), s(1, 150, 7)]).bins).toEqual([])
    })

    it('rounds, sorts and merges bins', () => {
        const h = buildHrHistogram([
            s(0, 160, 0),
            s(1.04, 160, 3.4),
            s(2.08, 140, 6.8),
            s(3.12, 160, 10.2),
        ])
        expect(h.bins).toEqual([
            [140, 1, 3],
            [160, 2.1, 7],
        ])
    })

    it('returns an empty histogram without usable intervals', () => {
        expect(buildHrHistogram([])).toEqual({ v: 1, bins: [] })
    })
})

describe('parseHrHistogram', () => {
    it('accepts a valid value', () => {
        const v = { v: 1, bins: [[150, 1.5, 4]] }
        expect(parseHrHistogram(v)).toEqual(v)
    })

    it('returns null for invalid values', () => {
        expect(parseHrHistogram(null)).toBeNull()
        expect(parseHrHistogram('x')).toBeNull()
        expect(parseHrHistogram({ v: 2, bins: [] })).toBeNull()
        expect(parseHrHistogram({ v: 1, bins: [[150, 1]] })).toBeNull()
        expect(parseHrHistogram({ v: 1, bins: [['a', 1, 2]] })).toBeNull()
    })
})
