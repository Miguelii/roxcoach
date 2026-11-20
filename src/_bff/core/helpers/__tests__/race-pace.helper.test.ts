import { describe, expect, it } from 'vitest'
import { formatPace } from '@/_bff/core/utils/formatters.utils'
import { requiredPaceMps } from '@/_bff/core/helpers/race-pace.helper'

describe('requiredPaceMps', () => {
    it('returns the goal speed in m/s', () => {
        expect(requiredPaceMps(10000, 2399)).toBeCloseTo(4.168, 3)
        expect(requiredPaceMps(10000, 2400)).toBeCloseTo(4.1667, 3)
    })

    it('formats through formatPace', () => {
        expect(formatPace(requiredPaceMps(10000, 2400))).toBe('4:00 /km')
        expect(formatPace(requiredPaceMps(21097, 5400))).toBe('4:16 /km')
    })

    it('is guarded for a zero or negative distance or time', () => {
        expect(requiredPaceMps(0, 2400)).toBe(0)
        expect(requiredPaceMps(-5, 2400)).toBe(0)
        expect(requiredPaceMps(10000, 0)).toBe(0)
        expect(formatPace(requiredPaceMps(0, 2400))).toBeNull()
    })
})
