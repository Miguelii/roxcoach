import { HYROX_DIVISIONS } from '@/_bff/core/constants/hyrox.constants'
import type { RaceInput } from '@/_bff/modules/races/types'

type RaceField = keyof RaceInput | 'resultTimeS'

type ValidationResult = { ok: true } | { ok: false; field: RaceField; message: string }

type Options = { allowPastDate?: boolean }

const fail = (field: RaceField, message: string): ValidationResult => ({
    ok: false,
    field,
    message,
})

// True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30).
const isCalendarDate = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

// Returns the first problem found, or { ok: true }. `today` is the athlete's local date. The date
// must be strictly after `today` unless `allowPastDate` is set (editing a completed race).
export const validateRace = (
    input: RaceInput,
    today: string,
    options: Options = {}
): ValidationResult => {
    const nameLength = input.name.trim().length
    if (nameLength < 1 || nameLength > 80) return fail('name', 'Name must be 1 to 80 characters')
    if (!isCalendarDate(input.raceDate)) return fail('raceDate', 'Date is not a valid date')
    if (!options.allowPastDate && input.raceDate <= today)
        return fail('raceDate', 'Date must be in the future')
    if (input.location !== null && input.location.length > 80)
        return fail('location', 'Location must be at most 80 characters')

    if (input.raceType === 'running') {
        const distance = input.distanceM
        if (distance === null || !Number.isInteger(distance) || distance < 400 || distance > 200000)
            return fail('distanceM', 'Distance must be 400 to 200000 meters')
    }
    if (input.raceType === 'other' && input.distanceM !== null)
        return fail('distanceM', 'Other races have no distance')
    if (input.raceType !== 'hyrox' && input.hyroxDivision !== null)
        return fail('hyroxDivision', 'Only Hyrox races have a division')
    if (input.raceType === 'hyrox') {
        if (
            input.hyroxDivision === null ||
            !HYROX_DIVISIONS.some((division) => division.key === input.hyroxDivision)
        )
            return fail('hyroxDivision', 'A valid Hyrox division is required')
        if (input.distanceM !== null) return fail('distanceM', 'Hyrox races have no distance')
    }

    if (!Number.isInteger(input.targetTimeS) || input.targetTimeS < 60 || input.targetTimeS > 86400)
        return fail('targetTimeS', 'Target time must be 1 minute to 24 hours')
    if (input.notes !== null && input.notes.length > 500)
        return fail('notes', 'Notes must be at most 500 characters')
    return { ok: true }
}

export const validateResultTime = (resultTimeS: number): ValidationResult =>
    Number.isInteger(resultTimeS) && resultTimeS >= 1 && resultTimeS <= 86400
        ? { ok: true }
        : fail('resultTimeS', 'Result time must be 1 second to 24 hours')
