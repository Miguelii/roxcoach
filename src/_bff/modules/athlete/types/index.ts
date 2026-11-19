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
