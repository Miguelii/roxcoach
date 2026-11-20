import type { HyroxDivision } from '@/_bff/core/constants/hyrox.constants'

type RaceType = 'hyrox' | 'running' | 'other'
type RacePriority = 'A' | 'B' | 'C'
export type RaceStatus = 'upcoming' | 'completed' | 'cancelled'

export type RaceDTO = {
    id: string
    name: string
    raceType: RaceType
    raceDate: string
    location: string | null
    distanceM: number | null
    hyroxDivision: HyroxDivision | null
    targetTimeS: number
    priority: RacePriority
    status: RaceStatus
    resultTimeS: number | null
    notes: string | null
}

export type RaceInput = Omit<RaceDTO, 'id' | 'status' | 'resultTimeS'>

export type RaceFilter = { status?: RaceStatus[]; from?: string; to?: string }
