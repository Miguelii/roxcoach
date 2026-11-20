import { describe, expect, it } from 'vitest'
import { validateProfile } from '@/_bff/modules/athlete/helpers/profile-validation.helper'
import type { ProfileInput } from '@/_bff/modules/athlete/types'

const VALID: ProfileInput = {
    displayName: 'Ana',
    timezone: 'Europe/Lisbon',
    maxHr: 190,
    restingHr: 50,
    hyroxDivision: 'open_women',
    weeklyHoursCap: 8,
    notes: 'Left knee',
}

const fieldOf = (patch: Partial<ProfileInput>) => {
    const result = validateProfile({ ...VALID, ...patch })
    return result.ok ? null : result.field
}

describe('validateProfile', () => {
    it('accepts a full valid input and an all-optional-null input', () => {
        expect(validateProfile(VALID)).toEqual({ ok: true })
        expect(
            validateProfile({
                ...VALID,
                maxHr: null,
                restingHr: null,
                hyroxDivision: null,
                weeklyHoursCap: null,
                notes: null,
            })
        ).toEqual({ ok: true })
    })

    it('rejects an empty, whitespace-only or too long display name', () => {
        expect(fieldOf({ displayName: '   ' })).toBe('displayName')
        expect(fieldOf({ displayName: 'a'.repeat(61) })).toBe('displayName')
        expect(fieldOf({ displayName: 'a'.repeat(60) })).toBeNull()
    })

    it('rejects an unknown timezone', () => {
        expect(fieldOf({ timezone: 'Mars/Phobos' })).toBe('timezone')
    })

    it('enforces max heart rate 120 to 230', () => {
        expect(fieldOf({ maxHr: 119, restingHr: null })).toBe('maxHr')
        expect(fieldOf({ maxHr: 120, restingHr: null })).toBeNull()
        expect(fieldOf({ maxHr: 230 })).toBeNull()
        expect(fieldOf({ maxHr: 231 })).toBe('maxHr')
    })

    it('enforces resting heart rate 30 to 120', () => {
        expect(fieldOf({ restingHr: 29 })).toBe('restingHr')
        expect(fieldOf({ restingHr: 30 })).toBeNull()
        expect(fieldOf({ restingHr: 120, maxHr: 230 })).toBeNull()
        expect(fieldOf({ restingHr: 121, maxHr: 230 })).toBe('restingHr')
    })

    it('rejects non-integer heart rates', () => {
        expect(fieldOf({ maxHr: 190.5 })).toBe('maxHr')
        expect(fieldOf({ restingHr: 50.5 })).toBe('restingHr')
    })

    it('requires resting below max when both are set', () => {
        expect(fieldOf({ maxHr: 120, restingHr: 120 })).toBe('restingHr')
        expect(fieldOf({ maxHr: 120, restingHr: 119 })).toBeNull()
    })

    it('enforces weekly hours cap above 0 and at most 40', () => {
        expect(fieldOf({ weeklyHoursCap: 0 })).toBe('weeklyHoursCap')
        expect(fieldOf({ weeklyHoursCap: 40.5 })).toBe('weeklyHoursCap')
        expect(fieldOf({ weeklyHoursCap: 40 })).toBeNull()
    })

    it('limits notes to 1000 characters', () => {
        expect(fieldOf({ notes: 'a'.repeat(1001) })).toBe('notes')
        expect(fieldOf({ notes: 'a'.repeat(1000) })).toBeNull()
    })

    it('rejects an unknown division', () => {
        // SAFETY: exercises a value the type forbids.
        expect(fieldOf({ hyroxDivision: 'masters' as never })).toBe('hyroxDivision')
    })
})
