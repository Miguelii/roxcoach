import { addDays, daysBetween, isoWeekday } from '@/modules/calendar/date-utils'
import type {
    AvailabilitySlot,
    CalendarItem,
    Category,
    MockActivity,
    MockPlannedSession,
    MockRace,
} from '@/modules/mock/types'

type Template = {
    kind: Category
    title: string
    minutes: number
    description: string
    paceSecPerKm: number | null
    avgHr: number
    rpe: number
}

/** Fixed "today" so the mockup renders the same on server and client. */
export const TODAY = '2026-11-19'

const FIRST_DAY = '2026-10-12'
const LAST_DAY = '2027-02-27'

/** The coach writes one week ahead: sessions exist up to the end of next week. */
const PLAN_HORIZON = '2026-11-29'

const SILVESTRE_ID = 'race-silvestre'
const HYROX_LISBON_ID = 'race-hyrox-lisbon'

const RACES: MockRace[] = [
    {
        id: 'race-parkrun',
        name: 'Parkrun Monsanto 5k',
        type: 'running',
        date: '2026-12-12',
        location: 'Lisbon',
        distanceM: 5000,
        division: null,
        targetS: 1170,
        priority: 'C',
        status: 'upcoming',
        resultS: null,
    },
    {
        id: SILVESTRE_ID,
        name: 'S. Silvestre Guimaraes 10k',
        type: 'running',
        date: '2026-12-31',
        location: 'Guimaraes',
        distanceM: 10000,
        division: null,
        targetS: 2399,
        priority: 'B',
        status: 'upcoming',
        resultS: null,
    },
    {
        id: HYROX_LISBON_ID,
        name: 'Hyrox Lisbon',
        type: 'hyrox',
        date: LAST_DAY,
        location: 'Lisbon',
        distanceM: null,
        division: 'Open, men',
        targetS: 4200,
        priority: 'A',
        status: 'upcoming',
        resultS: null,
    },
    {
        id: 'race-hyrox-porto',
        name: 'Hyrox Porto',
        type: 'hyrox',
        date: '2026-05-23',
        location: 'Porto',
        distanceM: null,
        division: 'Open, men',
        targetS: 4500,
        priority: 'A',
        status: 'completed',
        resultS: 4602,
    },
]

export const AVAILABILITY: AvailabilitySlot[] = [
    { weekday: 1, kind: 'rest', fixed: false, maxMinutes: null, notes: null },
    { weekday: 2, kind: 'hyrox', fixed: true, maxMinutes: 60, notes: 'Gym class, 19:00' },
    { weekday: 3, kind: 'run', fixed: false, maxMinutes: 60, notes: null },
    { weekday: 4, kind: 'run', fixed: false, maxMinutes: 60, notes: 'Track available' },
    { weekday: 5, kind: 'strength', fixed: false, maxMinutes: 60, notes: null },
    { weekday: 6, kind: 'run', fixed: false, maxMinutes: 120, notes: 'Long run day' },
    { weekday: 7, kind: 'cross', fixed: false, maxMinutes: 45, notes: 'Optional, easy only' },
]

/** Index 0 is Monday. */
const WEEK_TEMPLATE: (Template | null)[] = [
    null,
    {
        kind: 'hyrox',
        title: 'Hyrox class',
        minutes: 60,
        description: 'Fixed class. Keep the runs controlled and hold back on the sleds.',
        paceSecPerKm: null,
        avgHr: 158,
        rpe: 8,
    },
    {
        kind: 'run',
        title: 'Easy run',
        minutes: 45,
        description: 'Conversational pace, 5:40 to 6:00 /km. Heart rate under 150.',
        paceSecPerKm: 340,
        avgHr: 142,
        rpe: 3,
    },
    {
        kind: 'run',
        title: 'Intervals',
        minutes: 55,
        description: '15 min warm-up, 6 x 800 m at 3:55 /km with 90 s jog, 10 min cool down.',
        paceSecPerKm: 295,
        avgHr: 162,
        rpe: 8,
    },
    {
        kind: 'strength',
        title: 'Strength',
        minutes: 45,
        description: 'Lower body and core: squats, lunges, carries. Stop 2 reps before failure.',
        paceSecPerKm: null,
        avgHr: 118,
        rpe: 6,
    },
    {
        kind: 'run',
        title: 'Long run',
        minutes: 90,
        description: 'Steady at 5:30 /km, last 15 min at 5:00 /km.',
        paceSecPerKm: 330,
        avgHr: 148,
        rpe: 6,
    },
    {
        kind: 'cross',
        title: 'Recovery spin',
        minutes: 40,
        description: 'Easy bike or row, zone 1 to 2. Skip it if the legs feel heavy.',
        paceSecPerKm: null,
        avgHr: 120,
        rpe: 2,
    },
]

// Dates where the plan was not followed, to exercise the skipped and missed states
const SKIPPED_DATES = new Set(['2026-11-06'])
const MISSED_DATES = new Set(['2026-11-11'])
const MANUAL_DATES = new Set(['2026-11-17'])

const raceDates = new Set(RACES.map((race) => race.date))

const round5 = (value: number) => Math.max(15, Math.round(value / 5) * 5)

const volumeFactor = (date: string) => {
    const weekIndex = Math.floor(daysBetween(FIRST_DAY, date) / 7)
    const cycle = [1, 1.08, 1.15, 0.7][weekIndex % 4] ?? 1

    const toSilvestre = daysBetween(date, '2026-12-31')
    const toHyrox = daysBetween(date, LAST_DAY)
    if (toSilvestre >= 1 && toSilvestre <= 2) return 0.4
    if (toSilvestre > 2 && toSilvestre <= 7) return 0.7
    if (toSilvestre < 0 && toSilvestre >= -2) return 0.5
    if (toHyrox >= 1 && toHyrox <= 2) return 0.4
    if (toHyrox > 2 && toHyrox <= 10) return 0.65

    return cycle
}

const jitter = (index: number) => 0.9 + ((index * 37) % 21) / 100

const buildData = () => {
    const activities: MockActivity[] = []
    const planned: MockPlannedSession[] = []
    const total = daysBetween(FIRST_DAY, PLAN_HORIZON)

    for (let index = 0; index <= total; index++) {
        const date = addDays(FIRST_DAY, index)
        const weekday = isoWeekday(date)
        const weekIndex = Math.floor(index / 7)
        const template = WEEK_TEMPLATE[weekday - 1]

        if (!template || raceDates.has(date)) continue
        if (weekday === 7 && weekIndex % 2 === 1) continue

        const minutes = round5(template.minutes * volumeFactor(date))
        const isPast = date < TODAY
        const raceId = date <= '2026-12-31' ? SILVESTRE_ID : HYROX_LISBON_ID
        const base = { id: `plan-${date}`, date, kind: template.kind, raceId }
        const info = {
            title: template.title,
            description: template.description,
            targetMinutes: minutes,
        }

        if (!isPast) {
            planned.push({ ...base, ...info, status: 'planned', matchedActivityId: null })
            continue
        }

        if (SKIPPED_DATES.has(date)) {
            planned.push({ ...base, ...info, status: 'skipped', matchedActivityId: null })
            continue
        }

        if (MISSED_DATES.has(date)) {
            planned.push({ ...base, ...info, status: 'planned', matchedActivityId: null })
            continue
        }

        const durationS = Math.round(minutes * 60 * jitter(index))
        const activityId = `act-${date}`
        activities.push({
            id: activityId,
            date,
            category: template.kind,
            name: template.title,
            durationS,
            distanceM: template.paceSecPerKm
                ? Math.round(((durationS / template.paceSecPerKm) * 1000) / 10) * 10
                : null,
            avgHr: template.avgHr + (index % 5) - 2,
            rpe: template.rpe,
            source: MANUAL_DATES.has(date) ? 'manual' : 'strava',
        })
        planned.push({ ...base, ...info, status: 'done', matchedActivityId: activityId })
    }

    return { activities, planned }
}

const { activities, planned } = buildData()

export const ACTIVITIES = activities

export const PLANNED_SESSIONS = planned

export const getActivity = (id: string) => ACTIVITIES.find((activity) => activity.id === id)

/** Everything the calendar shows. Done planned sessions are represented by their activity. */
export const CALENDAR_ITEMS: CalendarItem[] = [
    ...ACTIVITIES.map((activity): CalendarItem => ({
        type: 'activity',
        date: activity.date,
        activity,
    })),
    ...PLANNED_SESSIONS.filter((session) => session.status !== 'done').map(
        (session): CalendarItem => ({ type: 'planned', date: session.date, session })
    ),
    ...RACES.map((race): CalendarItem => ({ type: 'race', date: race.date, race })),
]

export const itemsOn = (date: string) => CALENDAR_ITEMS.filter((item) => item.date === date)

export const upcomingRaces = () =>
    RACES.filter((race) => race.status === 'upcoming').toSorted((a, b) =>
        a.date.localeCompare(b.date)
    )

export const completedRaces = () => RACES.filter((race) => race.status === 'completed')
