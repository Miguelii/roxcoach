import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import type { WeeklyGoals } from '@/_bff/core/constants/weekly-goals.constants'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    selectWeeklyGoals,
    upsertWeeklyGoals,
} from '@/_bff/modules/athlete/repositories/weekly-goals.repository'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'

const ROW = {
    weekly_run_distance_m: 25000,
    long_runs_per_week: 1,
    fast_runs_per_week: 2,
    strength_sessions_per_week: null,
    short_run_max_m: 3500,
    long_run_min_m: 8000,
    fast_pace_s_per_km: 285,
}

const GOALS: WeeklyGoals = {
    weeklyRunDistanceM: 25000,
    longRunsPerWeek: 1,
    fastRunsPerWeek: 2,
    strengthSessionsPerWeek: null,
    runTypeRules: { shortRunMaxM: 3500, longRunMinM: 8000, fastPaceSPerKm: 285 },
}

const DENIED = { data: null, error: { code: '42501', message: 'denied' } }

describe('selectWeeklyGoals', () => {
    it('maps the row to WeeklyGoals, filtered by user_id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(ROW))

        expect(await Effect.runPromise(selectWeeklyGoals(supabase, 'user-1'))).toEqual(GOALS)
        expect(calls[0]?.table).toBe('weekly_goals')
        expect(calls[0]?.filters).toEqual([['user_id', 'user-1']])
    })

    it('returns null when the athlete has no row', async () => {
        const { supabase } = makeFakeAdminDb(() => ok(null))

        expect(await Effect.runPromise(selectWeeklyGoals(supabase, 'user-1'))).toBeNull()
    })

    it('fails with WeeklyGoalsQueryError on a returned error and on a bad row', async () => {
        const returned = makeFakeAdminDb(() => DENIED)
        const thrown = makeFakeAdminDb(() => new Error('down'))
        const malformed = makeFakeAdminDb(() => ok({ ...ROW, fast_pace_s_per_km: 'fast' }))

        const exits = await Promise.all(
            [returned, thrown, malformed].map(({ supabase }) =>
                Effect.runPromiseExit(selectWeeklyGoals(supabase, 'user-1'))
            )
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual([
            'WeeklyGoalsQueryError',
            'WeeklyGoalsQueryError',
            'WeeklyGoalsQueryError',
        ])
    })
})

describe('upsertWeeklyGoals', () => {
    it('upserts with user_id set and onConflict user_id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(upsertWeeklyGoals(supabase, 'user-1', GOALS))

        expect(calls[0]?.table).toBe('weekly_goals')
        expect(calls[0]?.op).toBe('upsert')
        expect(calls[0]?.options).toEqual({ onConflict: 'user_id' })
        expect(calls[0]?.payload).toEqual({ user_id: 'user-1', ...ROW })
    })

    it('fails with WeeklyGoalsQueryError on returned and thrown errors', async () => {
        const returned = makeFakeAdminDb(() => DENIED)
        const thrown = makeFakeAdminDb(() => new Error('down'))

        const exits = await Promise.all(
            [returned, thrown].map(({ supabase }) =>
                Effect.runPromiseExit(upsertWeeklyGoals(supabase, 'user-1', GOALS))
            )
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual([
            'WeeklyGoalsQueryError',
            'WeeklyGoalsQueryError',
        ])
    })
})
