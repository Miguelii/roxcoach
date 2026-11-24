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

// What athlete.getProfile returns: the profile plus the sign-in email, shown read-only in Settings
// and never saved. Kept out of ProfileDTO so the coach context never receives the email.
export type ProfileViewDTO = ProfileDTO & { email: string | null }

export type AvailabilitySlotDTO = {
    weekday: number
    sessionKind: SessionKind
    isFixed: boolean
    maxMinutes: number | null
    notes: string | null
}
