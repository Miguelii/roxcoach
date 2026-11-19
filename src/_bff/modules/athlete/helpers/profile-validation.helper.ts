import { HYROX_DIVISIONS } from '@/_bff/core/constants/hyrox.constants'
import type { ProfileInput } from '@/_bff/modules/athlete/types'

type ProfileField = keyof ProfileInput

type ValidationResult = { ok: true } | { ok: false; field: ProfileField; message: string }

const fail = (field: ProfileField, message: string): ValidationResult => ({
    ok: false,
    field,
    message,
})

const isValidTimezone = (timezone: string): boolean => {
    try {
        // The constructor throws a RangeError for an unknown IANA zone.
        return (
            Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone !== ''
        )
    } catch {
        return false
    }
}

const outOfRange = (value: number | null, min: number, max: number): boolean =>
    value !== null && (!Number.isInteger(value) || value < min || value > max)

// Returns the first problem found, or { ok: true }.
export const validateProfile = (input: ProfileInput): ValidationResult => {
    const nameLength = input.displayName.trim().length
    if (nameLength < 1 || nameLength > 60)
        return fail('displayName', 'Display name must be 1 to 60 characters')
    if (!isValidTimezone(input.timezone)) return fail('timezone', 'Unknown timezone')
    if (outOfRange(input.maxHr, 120, 230)) return fail('maxHr', 'Max heart rate must be 120 to 230')
    if (outOfRange(input.restingHr, 30, 120))
        return fail('restingHr', 'Resting heart rate must be 30 to 120')
    if (input.maxHr !== null && input.restingHr !== null && input.restingHr >= input.maxHr)
        return fail('restingHr', 'Resting heart rate must be below max heart rate')
    if (input.weeklyHoursCap !== null && (input.weeklyHoursCap <= 0 || input.weeklyHoursCap > 40))
        return fail('weeklyHoursCap', 'Weekly hours cap must be above 0 and at most 40')
    if (input.notes !== null && input.notes.length > 1000)
        return fail('notes', 'Notes must be at most 1000 characters')
    if (
        input.hyroxDivision !== null &&
        !HYROX_DIVISIONS.some((division) => division.key === input.hyroxDivision)
    )
        return fail('hyroxDivision', 'Unknown Hyrox division')
    return { ok: true }
}
