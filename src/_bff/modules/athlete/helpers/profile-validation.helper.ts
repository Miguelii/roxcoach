import { PROFILE_LIMITS } from '@/_bff/core/constants/athlete.constants'
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
    if (nameLength < 1 || nameLength > PROFILE_LIMITS.nameMaxLength)
        return fail(
            'displayName',
            `Display name must be 1 to ${PROFILE_LIMITS.nameMaxLength} characters`
        )
    if (!isValidTimezone(input.timezone)) return fail('timezone', 'Unknown timezone')
    if (outOfRange(input.maxHr, PROFILE_LIMITS.minMaxHr, PROFILE_LIMITS.maxMaxHr))
        return fail(
            'maxHr',
            `Max heart rate must be ${PROFILE_LIMITS.minMaxHr} to ${PROFILE_LIMITS.maxMaxHr}`
        )
    if (outOfRange(input.restingHr, PROFILE_LIMITS.minRestingHr, PROFILE_LIMITS.maxRestingHr))
        return fail(
            'restingHr',
            `Resting heart rate must be ${PROFILE_LIMITS.minRestingHr} to ${PROFILE_LIMITS.maxRestingHr}`
        )
    if (input.maxHr !== null && input.restingHr !== null && input.restingHr >= input.maxHr)
        return fail('restingHr', 'Resting heart rate must be below max heart rate')
    if (
        input.weeklyHoursCap !== null &&
        (input.weeklyHoursCap <= 0 || input.weeklyHoursCap > PROFILE_LIMITS.weeklyHoursCapMax)
    )
        return fail(
            'weeklyHoursCap',
            `Weekly hours cap must be above 0 and at most ${PROFILE_LIMITS.weeklyHoursCapMax}`
        )
    if (input.notes !== null && input.notes.length > PROFILE_LIMITS.notesMaxLength)
        return fail('notes', `Notes must be at most ${PROFILE_LIMITS.notesMaxLength} characters`)
    if (
        input.hyroxDivision !== null &&
        !HYROX_DIVISIONS.some((division) => division.key === input.hyroxDivision)
    )
        return fail('hyroxDivision', 'Unknown Hyrox division')
    return { ok: true }
}
