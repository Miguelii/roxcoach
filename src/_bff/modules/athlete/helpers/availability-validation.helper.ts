import { SESSION_KINDS } from '@/_bff/core/constants/availability.constants'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'

type ValidationResult = { ok: true } | { ok: false; reason: string }

const MIN_MINUTES = 15
const MAX_MINUTES = 360
const MAX_NOTES_LENGTH = 200
const MAX_SLOTS_PER_WEEKDAY = 4

const fail = (reason: string): ValidationResult => ({ ok: false, reason })

// Returns the first problem found as a stable reason code, or { ok: true }.
export const validateAvailability = (slots: AvailabilitySlotDTO[]): ValidationResult => {
    const seen = new Set<string>()
    const byWeekday = new Map<number, AvailabilitySlotDTO[]>()

    for (const slot of slots) {
        if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7)
            return fail('weekday_out_of_range')
        if (!SESSION_KINDS.includes(slot.sessionKind)) return fail('unknown_session_kind')
        const key = `${slot.weekday}:${slot.sessionKind}`
        if (seen.has(key)) return fail('duplicate_slot')
        seen.add(key)

        if (slot.sessionKind === 'rest' && (slot.isFixed || slot.maxMinutes !== null))
            return fail('rest_slot_has_details')
        if (
            slot.maxMinutes !== null &&
            (!Number.isInteger(slot.maxMinutes) ||
                slot.maxMinutes < MIN_MINUTES ||
                slot.maxMinutes > MAX_MINUTES)
        )
            return fail('max_minutes_out_of_range')
        if (slot.notes !== null && slot.notes.length > MAX_NOTES_LENGTH)
            return fail('notes_too_long')

        byWeekday.set(slot.weekday, [...(byWeekday.get(slot.weekday) ?? []), slot])
    }

    for (const daySlots of byWeekday.values()) {
        if (daySlots.length > MAX_SLOTS_PER_WEEKDAY) return fail('too_many_slots_in_weekday')
        if (daySlots.length > 1 && daySlots.some((slot) => slot.sessionKind === 'rest'))
            return fail('rest_day_not_exclusive')
    }
    return { ok: true }
}
