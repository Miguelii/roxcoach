import type { ActivityDTO, CalendarItem, LapDTO } from '@/_bff/modules/training/types'

export const makeActivity = (overrides: Partial<ActivityDTO> = {}): ActivityDTO => ({
    id: 'act-1',
    source: 'manual',
    category: 'run',
    name: 'Easy run',
    startedAt: '2026-11-18T07:30:00+00:00',
    localDate: '2026-11-18',
    distanceM: 8000,
    movingTimeS: 2700,
    elapsedTimeS: 2800,
    elevationGainM: null,
    avgHr: null,
    maxHr: null,
    avgSpeedMps: null,
    calories: null,
    perceivedEffort: null,
    notes: null,
    ...overrides,
})

export const makeLap = (overrides: Partial<LapDTO> = {}): LapDTO => ({
    lapIndex: 1,
    name: null,
    distanceM: 1000,
    elapsedTimeS: 300,
    movingTimeS: 295,
    avgHr: null,
    avgSpeedMps: null,
    station: null,
    ...overrides,
})

export const makeItem = (overrides: Partial<ActivityDTO> = {}): CalendarItem => {
    const activity = makeActivity(overrides)
    return { type: 'activity', date: activity.localDate, activity }
}
