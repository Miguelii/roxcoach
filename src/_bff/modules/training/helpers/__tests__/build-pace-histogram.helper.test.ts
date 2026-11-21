import { describe, expect, it } from 'vitest'
import {
    buildPaceHistogram,
    parsePaceHistogram,
} from '@/_bff/modules/training/helpers/build-pace-histogram.helper'
import type { HrSample } from '@/_bff/modules/training/types/progress'

// One sample per second at a constant speed, cumulative distance.
const steady = (n: number, speed: number, startT = 0, startDist = 0, hr: number | null = 150) =>
    Array.from({ length: n }, (_, i): HrSample => ({
        t: startT + i * 1000,
        hr,
        distanceM: startDist + i * speed,
        speedMps: speed,
    }))

describe('buildPaceHistogram', () => {
    it('puts a steady effort in one bin', () => {
        expect(buildPaceHistogram(steady(10, 4))).toEqual({ v: 1, bins: [[250, 9, 36]] })
    })

    it('separates paces and sorts the bins ascending', () => {
        const slow = steady(5, 3)
        const fast = steady(5, 5, 4000, 12)
        const { bins } = buildPaceHistogram([...slow, ...fast])
        expect(bins.map((bin) => bin[0])).toEqual([200, 330])
    })

    it('counts samples without heart rate', () => {
        expect(buildPaceHistogram(steady(10, 4, 0, 0, null)).bins).toHaveLength(1)
    })

    it('skips gaps, stops and samples without distance or speed', () => {
        const gap = [steady(1, 4)[0]!, { ...steady(1, 4)[0]!, t: 60_000, distanceM: 240 }]
        const stopped = steady(10, 0.2)
        const blind = steady(10, 4).map((s) => ({ ...s, distanceM: null, speedMps: null }))
        expect(buildPaceHistogram(gap)).toEqual({ v: 1, bins: [] })
        expect(buildPaceHistogram(stopped)).toEqual({ v: 1, bins: [] })
        expect(buildPaceHistogram(blind)).toEqual({ v: 1, bins: [] })
    })

    it('clamps very fast and very slow paces into the edge bins', () => {
        const fast = buildPaceHistogram(steady(3, 10)).bins[0]![0]
        const slow = buildPaceHistogram(steady(3, 1)).bins[0]![0]
        expect(fast).toBe(150)
        expect(slow).toBe(600)
    })
})

describe('parsePaceHistogram', () => {
    it('accepts a valid version 1 value', () => {
        expect(parsePaceHistogram({ v: 1, bins: [[250, 9, 36]] })).toEqual({
            v: 1,
            bins: [[250, 9, 36]],
        })
    })

    it('returns null for other versions and for junk', () => {
        expect(parsePaceHistogram({ v: 2, bins: [] })).toBeNull()
        expect(parsePaceHistogram(null)).toBeNull()
        expect(parsePaceHistogram('x')).toBeNull()
    })
})
