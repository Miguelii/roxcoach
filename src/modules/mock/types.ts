export type Category = 'run' | 'hyrox' | 'strength' | 'cross'

type PlannedStatus = 'planned' | 'done' | 'skipped'

type RacePriority = 'A' | 'B' | 'C'

export type MockActivity = {
    id: string
    date: string
    category: Category
    name: string
    durationS: number
    distanceM: number | null
    avgHr: number | null
    rpe: number | null
    source: 'strava' | 'manual'
}

export type MockPlannedSession = {
    id: string
    date: string
    kind: Category
    title: string
    description: string
    targetMinutes: number
    status: PlannedStatus
    matchedActivityId: string | null
    raceId: string | null
}

export type MockRace = {
    id: string
    name: string
    type: 'hyrox' | 'running'
    date: string
    location: string
    distanceM: number | null
    division: string | null
    targetS: number
    priority: RacePriority
    status: 'upcoming' | 'completed'
    resultS: number | null
}

export type AvailabilitySlot = {
    weekday: number
    kind: Category | 'rest'
    fixed: boolean
    maxMinutes: number | null
    notes: string | null
}

export type CalendarItem =
    | { type: 'activity'; date: string; activity: MockActivity }
    | { type: 'planned'; date: string; session: MockPlannedSession }
    | { type: 'race'; date: string; race: MockRace }
