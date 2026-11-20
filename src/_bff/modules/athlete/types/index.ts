import type { SessionKind } from '@/_bff/core/constants/availability.constants'
import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'

export type ProfileDTO = {
    displayName: string
    timezone: string
    maxHr: number | null
    restingHr: number | null
    hyroxDivision: HyroxDivision | null
    weeklyHoursCap: number | null
    notes: string | null
}

export type ProfileInput = ProfileDTO

export type AvailabilitySlotDTO = {
    weekday: number
    sessionKind: SessionKind
    isFixed: boolean
    maxMinutes: number | null
    notes: string | null
}
