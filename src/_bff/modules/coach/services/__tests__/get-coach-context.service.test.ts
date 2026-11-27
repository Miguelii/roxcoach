// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { getCoachContext } from '@/_bff/modules/coach/services/get-coach-context.service'
import type { ProfileDTO } from '@/_bff/modules/athlete/types'
import type { ActivityDTO, CalendarItem } from '@/_bff/modules/training/types'

// SAFETY: the fakes only read `user.id`.
const USER = { id: 'user-1' } as User

const ACTIVITY: ActivityDTO = {
    id: 'a1',
    source: 'manual',
    category: 'run',
    name: 'Tempo run',
    startedAt: '2026-11-19T07:00:00Z',
    localDate: '2026-11-19',
    distanceM: 10000,
    movingTimeS: 3000,
    elapsedTimeS: null,
    elevationGainM: null,
    avgHr: null,
    maxHr: null,
    avgSpeedMps: null,
    calories: null,
    bodyWeightKg: null,
    lyftaTotalVolumeKgReps: null,
    perceivedEffort: null,
    notes: null,
    runType: null,
    runTypeManual: false,
}

const RACE_ITEM: CalendarItem = {
    type: 'race',
    date: '2026-11-20',
    race: {
        id: 'r',
        name: 'Calendar race',
        raceType: 'running',
        raceDate: '2026-11-20',
        targetTimeS: 1,
        priority: 'A',
        status: 'upcoming',
    },
}

const PROFILE: ProfileDTO = {
    displayName: '',
    timezone: 'Pacific/Auckland',
    maxHr: null,
    restingHr: null,
    hyroxDivision: null,
    weeklyHoursCap: null,
    notes: null,
    dashboardMode: 'run',
}

const BASE = { profile: PROFILE, timezone: 'Pacific/Auckland', today: '2026-11-21' }

const make = () => {
    const calls: { name: string; args: unknown[] }[] = []
    const deps: NonNullable<Parameters<typeof getCoachContext>[2]> = {
        getAvailability: (user) => {
            calls.push({ name: 'availability', args: [user] })
            return Effect.succeed([])
        },
        listRaces: (user, filter) => {
            calls.push({ name: 'races', args: [user, filter] })
            return Effect.succeed([])
        },
        getActivityCalendar: (user, range) => {
            calls.push({ name: 'calendar', args: [user, range] })
            return Effect.succeed([
                { type: 'activity', date: '2026-11-19', activity: ACTIVITY },
                RACE_ITEM,
            ])
        },
    }

    return { calls, deps }
}

describe('getCoachContext', () => {
    it('gathers the data for the user and renders the block', async () => {
        const { calls, deps } = make()
        const result = await Effect.runPromise(getCoachContext(USER, BASE, deps))

        expect(result.timezone).toBe('Pacific/Auckland')
        // 12:00 UTC is already the next day in Auckland.
        expect(result.context).toContain('2026-11-21 (Saturday), timezone Pacific/Auckland')
        expect(result.context).toContain('Tempo run')
        expect(result.context).not.toContain('Calendar race')
        for (const call of calls) expect(call.args[0]).toBe(USER)
    })

    it('asks for upcoming races and the last 35 days of the calendar', async () => {
        const { calls, deps } = make()
        await Effect.runPromise(getCoachContext(USER, BASE, deps))

        expect(calls.find((call) => call.name === 'races')?.args[1]).toEqual({
            status: ['upcoming'],
        })
        expect(calls.find((call) => call.name === 'calendar')?.args[1]).toEqual({
            from: '2026-10-18',
            to: '2026-11-21',
        })
    })
})
