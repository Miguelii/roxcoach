import type { AvailabilitySlotDTO, ProfileDTO } from '@/_bff/modules/athlete/types'
import type { RaceDTO } from '@/_bff/modules/races/types'
import type { ActivityDTO } from '@/_bff/modules/training/types'

export type CoachContextInput = {
    // Plain `YYYY-MM-DD` in the athlete's timezone.
    today: string
    timezone: string
    profile: ProfileDTO | null
    availability: AvailabilitySlotDTO[]
    races: RaceDTO[]
    // Activities of the last 35 days.
    activities: ActivityDTO[]
}
