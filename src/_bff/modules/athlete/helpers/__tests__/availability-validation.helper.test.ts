import { describe, expect, it } from 'vitest'
import { validateAvailability } from '@/_bff/modules/athlete/helpers/availability-validation.helper'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'

const slot = (overrides: Partial<AvailabilitySlotDTO> = {}): AvailabilitySlotDTO => ({
    weekday: 1,
    sessionKind: 'run',
    isFixed: false,
    maxMinutes: 60,
    notes: null,
    ...overrides,
})

const reason = (slots: AvailabilitySlotDTO[]) => {
    const result = validateAvailability(slots)
    return result.ok ? null : result.reason
}

describe('validateAvailability', () => {
    it('accepts an empty list (no availability)', () => {
        expect(validateAvailability([])).toEqual({ ok: true })
    })

    it('accepts a full valid week', () => {
        const week = [
            slot({ weekday: 1, sessionKind: 'run' }),
            slot({ weekday: 1, sessionKind: 'strength', isFixed: true, maxMinutes: null }),
            slot({ weekday: 2, sessionKind: 'hyrox', maxMinutes: 360 }),
            slot({ weekday: 3, sessionKind: 'rest', isFixed: false, maxMinutes: null }),
            slot({ weekday: 4, sessionKind: 'cross', maxMinutes: 15 }),
            slot({ weekday: 5, sessionKind: 'run', notes: 'x'.repeat(200) }),
            slot({ weekday: 6, sessionKind: 'run' }),
            slot({ weekday: 7, sessionKind: 'rest', maxMinutes: null }),
        ]

        expect(validateAvailability(week)).toEqual({ ok: true })
    })

    it('rejects a weekday outside 1 to 7 or non-integer', () => {
        expect(reason([slot({ weekday: 0 })])).toBe('weekday_out_of_range')
        expect(reason([slot({ weekday: 8 })])).toBe('weekday_out_of_range')
        expect(reason([slot({ weekday: 1.5 })])).toBe('weekday_out_of_range')
    })

    it('rejects a duplicate (weekday, sessionKind)', () => {
        expect(reason([slot(), slot()])).toBe('duplicate_slot')
    })

    it('rejects a rest day that has another slot, in either order', () => {
        const rest = slot({ sessionKind: 'rest', maxMinutes: null })

        expect(reason([rest, slot()])).toBe('rest_day_not_exclusive')
        expect(reason([slot(), rest])).toBe('rest_day_not_exclusive')
    })

    it('rejects a rest slot that is fixed or has maxMinutes', () => {
        expect(reason([slot({ sessionKind: 'rest', isFixed: true, maxMinutes: null })])).toBe(
            'rest_slot_has_details'
        )
        expect(reason([slot({ sessionKind: 'rest', maxMinutes: 60 })])).toBe(
            'rest_slot_has_details'
        )
    })

    it('rejects maxMinutes outside 15 to 360', () => {
        expect(reason([slot({ maxMinutes: 14 })])).toBe('max_minutes_out_of_range')
        expect(reason([slot({ maxMinutes: 361 })])).toBe('max_minutes_out_of_range')
        expect(reason([slot({ maxMinutes: 30.5 })])).toBe('max_minutes_out_of_range')
    })

    it('rejects notes longer than 200 characters', () => {
        expect(reason([slot({ notes: 'x'.repeat(201) })])).toBe('notes_too_long')
    })

    it('rejects more than 4 slots in a weekday', () => {
        const five = (['hyrox', 'run', 'strength', 'cross'] as const).map((sessionKind) =>
            slot({ sessionKind })
        )
        expect(validateAvailability(five)).toEqual({ ok: true })
        const withRest = [...five, slot({ sessionKind: 'rest', maxMinutes: null })]

        expect(reason(withRest)).toBe('too_many_slots_in_weekday')
    })
})
