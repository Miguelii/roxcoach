import type { SessionKind } from '@/_bff/core/constants/availability.constants'
import type { DashboardMode } from '@/_bff/core/constants/athlete.constants'
import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'

export type ProfileDTO = {
    displayName: string
    timezone: string
    maxHr: number | null
    restingHr: number | null
    hyroxDivision: HyroxDivision | null
    weeklyHoursCap: number | null
    notes: string | null
    dashboardMode: DashboardMode
}

// What the profile form saves: the dashboard mode is saved on its own, never with the form.
export type ProfileInput = Omit<ProfileDTO, 'dashboardMode'>

export type AvailabilitySlotDTO = {
    weekday: number
    sessionKind: SessionKind
    isFixed: boolean
    maxMinutes: number | null
    notes: string | null
}
