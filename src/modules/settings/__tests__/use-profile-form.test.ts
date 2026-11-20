import { describe, expect, it } from 'vitest'
import { parseProfileValues, type ProfileFormValues } from '@/modules/settings/use-profile-form'

const VALID: ProfileFormValues = {
    displayName: 'Ana',
    timezone: 'Europe/Lisbon',
    maxHr: '190',
    restingHr: '50',
    hyroxDivision: 'open_women',
    weeklyHoursCap: '8.5',
    notes: 'Left knee',
}

const errorsOf = (patch: Partial<ProfileFormValues>) => {
    const result = parseProfileValues({ ...VALID, ...patch })
    return result.success ? {} : result.errors
}

describe('parseProfileValues', () => {
    it('converts strings to numbers', () => {
        const result = parseProfileValues(VALID)
        expect(result.success && result.values).toEqual({
            displayName: 'Ana',
            timezone: 'Europe/Lisbon',
            maxHr: 190,
            restingHr: 50,
            hyroxDivision: 'open_women',
            weeklyHoursCap: 8.5,
            notes: 'Left knee',
        })
    })

    it('turns empty optional strings into null', () => {
        const result = parseProfileValues({
            ...VALID,
            maxHr: '',
            restingHr: ' ',
            hyroxDivision: '',
            weeklyHoursCap: '',
            notes: '   ',
        })
        expect(result.success && result.values).toMatchObject({
            maxHr: null,
            restingHr: null,
            hyroxDivision: null,
            weeklyHoursCap: null,
            notes: null,
        })
    })

    it('rejects an empty name', () => {
        expect(errorsOf({ displayName: '  ' }).displayName).toBeTruthy()
    })

    it('rejects 241 bpm and non-integer heart rates', () => {
        expect(errorsOf({ maxHr: '241' }).maxHr).toBeTruthy()
        expect(errorsOf({ maxHr: '190.5' }).maxHr).toBeTruthy()
        expect(errorsOf({ restingHr: 'abc' }).restingHr).toBeTruthy()
    })

    it('requires resting below max', () => {
        expect(errorsOf({ maxHr: '150', restingHr: '150' }).restingHr).toBeTruthy()
    })

    it('rejects hours above 40 and zero', () => {
        expect(errorsOf({ weeklyHoursCap: '41' }).weeklyHoursCap).toBeTruthy()
        expect(errorsOf({ weeklyHoursCap: '0' }).weeklyHoursCap).toBeTruthy()
    })

    it('rejects notes over the limit', () => {
        expect(errorsOf({ notes: 'a'.repeat(1001) }).notes).toBeTruthy()
    })
})
