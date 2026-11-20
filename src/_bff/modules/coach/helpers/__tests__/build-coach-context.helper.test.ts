// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildCoachContext } from '@/_bff/modules/coach/helpers/build-coach-context.helper'
import type { CoachContextInput } from '@/_bff/modules/coach/types'
import type { AvailabilitySlotDTO, ProfileDTO } from '@/_bff/modules/athlete/types'
import type { RaceDTO } from '@/_bff/modules/races/types'
import type { ActivityDTO } from '@/_bff/modules/training/types'

const PROFILE: ProfileDTO = {
    displayName: 'Zephyrina Quuxbert',
    timezone: 'Europe/Lisbon',
    maxHr: 188,
    restingHr: 48,
    hyroxDivision: 'open_men',
    weeklyHoursCap: 8,
    notes: 'Left knee sensitive',
}

const race = (overrides: Partial<RaceDTO>): RaceDTO => ({
    id: 'race',
    name: 'Race',
    raceType: 'running',
    raceDate: '2026-12-06',
    location: null,
    distanceM: null,
    hyroxDivision: null,
    targetTimeS: 3600,
    priority: 'B',
    status: 'upcoming',
    resultTimeS: null,
    notes: null,
    ...overrides,
})

const RACES: RaceDTO[] = [
    race({
        id: 'r1',
        name: 'Hyrox Lisbon',
        raceType: 'hyrox',
        raceDate: '2027-01-16',
        location: 'Lisbon',
        hyroxDivision: 'open_men',
        targetTimeS: 4200,
        priority: 'A',
        notes: 'Main goal',
    }),
    race({ id: 'r2', name: 'Porto 10k', distanceM: 10000, targetTimeS: 2399 }),
]

const AVAILABILITY: AvailabilitySlotDTO[] = [
    { weekday: 1, sessionKind: 'run', isFixed: true, maxMinutes: 60, notes: 'Club session' },
    { weekday: 3, sessionKind: 'strength', isFixed: false, maxMinutes: null, notes: null },
    { weekday: 6, sessionKind: 'hyrox', isFixed: false, maxMinutes: 120, notes: null },
]

const activity = (overrides: Partial<ActivityDTO>): ActivityDTO => ({
    id: 'a',
    source: 'manual',
    category: 'run',
    name: 'Run',
    startedAt: '2026-11-19T07:00:00Z',
    localDate: '2026-11-19',
    distanceM: null,
    movingTimeS: null,
    elapsedTimeS: null,
    elevationGainM: null,
    avgHr: null,
    maxHr: null,
    avgSpeedMps: null,
    calories: null,
    perceivedEffort: null,
    notes: null,
    ...overrides,
})

const ACTIVITIES: ActivityDTO[] = [
    activity({
        id: 'a1',
        name: 'Tempo run',
        distanceM: 10000,
        movingTimeS: 3000,
        avgSpeedMps: 10000 / 3000,
        avgHr: 160,
        perceivedEffort: 7,
    }),
    activity({
        id: 'a2',
        name: 'Hyrox simulation',
        category: 'hyrox',
        startedAt: '2026-11-17T18:00:00Z',
        localDate: '2026-11-17',
        movingTimeS: 4500,
        avgHr: 150,
    }),
    activity({
        id: 'a3',
        name: 'Long run',
        startedAt: '2026-11-10T07:00:00Z',
        localDate: '2026-11-10',
        distanceM: 20000,
        movingTimeS: 6600,
        avgSpeedMps: 20000 / 6600,
    }),
    activity({
        id: 'a4',
        name: 'Easy run',
        startedAt: '2026-11-03T07:00:00Z',
        localDate: '2026-11-03',
        distanceM: 5000,
        movingTimeS: 1800,
        avgHr: 140,
    }),
    activity({
        id: 'a5',
        name: 'Gym',
        category: 'strength',
        startedAt: '2026-10-28T17:00:00Z',
        localDate: '2026-10-28',
        movingTimeS: 3600,
    }),
]

const FULL: CoachContextInput = {
    today: '2026-11-20',
    timezone: 'Europe/Lisbon',
    profile: PROFILE,
    availability: AVAILABILITY,
    races: RACES,
    activities: ACTIVITIES,
}

const EMPTY: CoachContextInput = {
    today: '2026-11-20',
    timezone: 'Europe/Lisbon',
    profile: null,
    availability: [],
    races: [],
    activities: [],
}

const TODAY_SECTION = 'Today\n2026-11-20 (Friday), timezone Europe/Lisbon'

const GOALS_SECTION = `Goals
- 2026-12-06 Porto 10k (running, priority B), 16 days to go, target 39:59, 10.0 km
- 2027-01-16 Hyrox Lisbon (hyrox, priority A), 57 days to go, target 1:10:00, Open Men, location Lisbon, notes: Main goal`

const AVAILABILITY_SECTION = `Availability
Monday: run (fixed, max 60 min, notes: Club session)
Tuesday: free
Wednesday: strength (open)
Thursday: free
Friday: free
Saturday: hyrox (open, max 120 min)
Sunday: free`

describe('buildCoachContext', () => {
    it('builds the full block for a complete athlete', () => {
        const expected = `${TODAY_SECTION}

Athlete
Max heart rate: 188 bpm
Resting heart rate: 48 bpm
Hyrox division: Open Men
Weekly hours cap: 8 h
Notes: Left knee sensitive

${GOALS_SECTION}

${AVAILABILITY_SECTION}

Last 4 weeks
Week of 2026-11-16: 2h 05m, 2 sessions, 10.0 km run
Week of 2026-11-09: 1h 50m, 1 sessions, 20.0 km run
Week of 2026-11-02: 30m, 1 sessions, 5.0 km run
Week of 2026-10-26: 1h 00m, 1 sessions, 0.0 km run
Load ratio (acute to chronic, latest week): 2.50 (Too high)

Recent
- 2026-11-19 | Tempo run | run | 10.0 km at 5:00 /km | 50m | avg HR 160 | effort 7
- 2026-11-17 | Hyrox simulation | hyrox | 1h 15m | avg HR 150
- 2026-11-10 | Long run | run | 20.0 km at 5:30 /km | 1h 50m
- 2026-11-03 | Easy run | run | 5.0 km | 30m | avg HR 140
- 2026-10-28 | Gym | strength | 1h 00m`

        expect(buildCoachContext(FULL)).toBe(expected)
    })

    it('states plainly that there are no races', () => {
        expect(buildCoachContext({ ...FULL, races: [] })).toContain(
            'Goals\nNo upcoming races.\n\nAvailability'
        )
    })

    it('states plainly that there is no profile', () => {
        expect(buildCoachContext({ ...FULL, profile: null })).toContain(
            'Athlete\nNo profile saved yet.\n\nGoals'
        )
    })

    it('states plainly that there are no activities', () => {
        const text = buildCoachContext({ ...FULL, activities: [] })

        expect(text).toContain('Last 4 weeks\nNo activities in the last 35 days.\n\nRecent')
        expect(text).toMatch(/Recent\nNo activities in the last 35 days\.$/u)
    })

    it('states plainly that there is no availability', () => {
        expect(buildCoachContext({ ...FULL, availability: [] })).toContain(
            'Availability\nNo weekly availability saved.\n\nLast 4 weeks'
        )
    })

    it('returns the exact empty block when nothing is known', () => {
        expect(buildCoachContext(EMPTY)).toBe(`${TODAY_SECTION}

Athlete
No profile saved yet.

Goals
No upcoming races.

Availability
No weekly availability saved.

Last 4 weeks
No activities in the last 35 days.

Recent
No activities in the last 35 days.`)
    })

    it('leaves completed and cancelled races out of Goals', () => {
        const races = [
            ...RACES,
            race({ id: 'r3', name: 'Done 5k', status: 'completed', raceDate: '2026-10-01' }),
            race({
                id: 'r4',
                name: 'Cancelled Marathon',
                status: 'cancelled',
                raceDate: '2027-04-01',
            }),
        ]
        const text = buildCoachContext({ ...FULL, races })

        expect(text).toContain(GOALS_SECTION)
        expect(text).not.toContain('Done 5k')
        expect(text).not.toContain('Cancelled Marathon')
    })

    it('shrinks Recent then Last 4 weeks and never cuts the other sections', () => {
        const full = buildCoachContext(FULL)
        const mid = buildCoachContext(FULL, full.length - 10)

        expect(mid).toContain('Tempo run')
        expect(mid).not.toContain('Gym')
        expect(mid).toContain('older entries omitted for length')
        expect(mid).toContain('Week of 2026-10-26')

        const tiny = buildCoachContext(FULL, 1)

        expect(tiny).toContain(GOALS_SECTION)
        expect(tiny).toContain(AVAILABILITY_SECTION)
        expect(tiny).toContain(TODAY_SECTION)
        expect(tiny).toContain('Notes: Left knee sensitive')
        expect(tiny).toContain(`Last 4 weeks
Load ratio (acute to chronic, latest week): 2.50 (Too high)
(4 older entries omitted for length)

Recent
(5 older entries omitted for length)`)
    })

    it('starts the week on Monday when today is a Monday', () => {
        const text = buildCoachContext({
            ...FULL,
            today: '2026-11-16',
            activities: [
                activity({ id: 'm1', localDate: '2026-11-16', movingTimeS: 600 }),
                activity({ id: 'm2', localDate: '2026-11-15', movingTimeS: 1200 }),
            ],
        })

        expect(text).toContain('2026-11-16 (Monday), timezone Europe/Lisbon')
        expect(text).toContain(
            'Week of 2026-11-16: 10m, 1 sessions, 0.0 km run\nWeek of 2026-11-09: 20m, 1 sessions'
        )
    })

    it('keeps a Sunday in the week that started on Monday', () => {
        const text = buildCoachContext({
            ...FULL,
            today: '2026-11-22',
            activities: [
                activity({ id: 's1', localDate: '2026-11-22', movingTimeS: 600 }),
                activity({ id: 's2', localDate: '2026-11-16', movingTimeS: 1200 }),
            ],
        })

        expect(text).toContain('2026-11-22 (Sunday), timezone Europe/Lisbon')
        expect(text).toContain(
            'Week of 2026-11-16: 30m, 2 sessions, 0.0 km run\nWeek of 2026-11-09: 0s, 0 sessions'
        )
    })

    it('never contains the display name or an em-dash', () => {
        const text = buildCoachContext(FULL)

        expect(text).not.toContain('Zephyrina')
        expect(text).not.toContain('Quuxbert')
        expect(text).not.toContain(String.fromCodePoint(0x2014))
    })
})
