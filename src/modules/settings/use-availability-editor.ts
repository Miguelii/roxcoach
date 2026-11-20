import type { SessionKind } from '@/_bff/core/constants/availability.constants'
import type { AvailabilitySlotDTO } from '@/_bff/modules/athlete/types'

const DEFAULT_MAX_MINUTES = 60
const MAX_SLOTS_PER_WEEKDAY = 4

// Adds a slot. Same kind twice on a day is ignored; rest is exclusive (it clears the day, and any
// other kind replaces the rest).
export const addSlot = (
    slots: AvailabilitySlotDTO[],
    weekday: number,
    sessionKind: SessionKind,
    isFixed: boolean
): AvailabilitySlotDTO[] => {
    const day = slots.filter((slot) => slot.weekday === weekday)
    if (day.some((slot) => slot.sessionKind === sessionKind)) return slots

    if (sessionKind === 'rest') {
        const rest: AvailabilitySlotDTO = {
            weekday,
            sessionKind,
            isFixed: false,
            maxMinutes: null,
            notes: null,
        }
        return [...slots.filter((slot) => slot.weekday !== weekday), rest]
    }

    const base = slots.filter((slot) => !(slot.weekday === weekday && slot.sessionKind === 'rest'))
    if (base.filter((slot) => slot.weekday === weekday).length >= MAX_SLOTS_PER_WEEKDAY)
        return slots
    return [
        ...base,
        { weekday, sessionKind, isFixed, maxMinutes: DEFAULT_MAX_MINUTES, notes: null },
    ]
}

export const removeSlot = (
    slots: AvailabilitySlotDTO[],
    weekday: number,
    sessionKind: SessionKind
): AvailabilitySlotDTO[] =>
    slots.filter((slot) => !(slot.weekday === weekday && slot.sessionKind === sessionKind))

// Sessions exclude rest days; hours are the sum of max minutes, rounded to one decimal.
export const summarize = (slots: AvailabilitySlotDTO[]) => {
    const sessions = slots.filter((slot) => slot.sessionKind !== 'rest')
    const minutes = sessions.reduce((sum, slot) => sum + (slot.maxMinutes ?? 0), 0)
    return { sessions: sessions.length, hours: Math.round((minutes / 60) * 10) / 10 }
}
