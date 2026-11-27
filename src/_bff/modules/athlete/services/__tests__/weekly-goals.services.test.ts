// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import {
    DEFAULT_WEEKLY_GOALS,
    type WeeklyGoals,
} from '@/_bff/core/constants/weekly-goals.constants'
import { ActivityWriteError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    getWeeklyGoals,
    getWeeklyGoalsWithClient,
} from '@/_bff/modules/athlete/services/get-weekly-goals.service'
import { saveWeeklyGoals } from '@/_bff/modules/athlete/services/save-weekly-goals.service'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User

const ROW = {
    weekly_run_distance_m: 30000,
    long_runs_per_week: 1,
    fast_runs_per_week: null,
    strength_sessions_per_week: 3,
    short_run_max_m: 3000,
    long_run_min_m: 6000,
    fast_pace_s_per_km: 300,
}

const fakeReclassify = (count: number) => vi.fn(() => Effect.succeed(count))

describe('getWeeklyGoalsWithClient', () => {
    it('returns DEFAULT_WEEKLY_GOALS without a row', async () => {
        const { supabase } = makeFakeAdminDb(() => ok(null))

        expect(await Effect.runPromise(getWeeklyGoalsWithClient(supabase, 'user-1'))).toEqual(
            DEFAULT_WEEKLY_GOALS
        )
    })
})

describe('getWeeklyGoals', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('returns the saved goals of the signed-in user', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(ROW))
        createDBServerClientMock.mockResolvedValue(supabase)

        expect(await Effect.runPromise(getWeeklyGoals(USER))).toEqual({
            ...DEFAULT_WEEKLY_GOALS,
            weeklyRunDistanceM: 30000,
            longRunsPerWeek: 1,
            strengthSessionsPerWeek: 3,
        })
        expect(calls[0]?.filters).toEqual([['user_id', 'user-1']])
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no cookies'))

        expect(failureTag(await Effect.runPromiseExit(getWeeklyGoals(USER)))).toBe(
            'CreateSbClientError'
        )
    })
})

describe('saveWeeklyGoals', () => {
    const GOALS: WeeklyGoals = { ...DEFAULT_WEEKLY_GOALS, weeklyRunDistanceM: 30000 }

    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('saves without reclassifying when the rules did not change', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(ROW))
        createDBServerClientMock.mockResolvedValue(supabase)
        const reclassifyRuns = fakeReclassify(4)

        expect(await Effect.runPromise(saveWeeklyGoals(USER, GOALS, { reclassifyRuns }))).toEqual({
            goals: GOALS,
            reclassified: 0,
        })
        expect(reclassifyRuns).not.toHaveBeenCalled()
        expect(calls.some((call) => call.op === 'upsert')).toBe(true)
    })

    it('reclassifies with the new rules when a threshold changed', async () => {
        const { supabase } = makeFakeAdminDb(() => ok(ROW))
        createDBServerClientMock.mockResolvedValue(supabase)
        const reclassifyRuns = fakeReclassify(3)
        const goals = { ...GOALS, runTypeRules: { ...GOALS.runTypeRules, longRunMinM: 8000 } }

        expect(await Effect.runPromise(saveWeeklyGoals(USER, goals, { reclassifyRuns }))).toEqual({
            goals,
            reclassified: 3,
        })
        expect(reclassifyRuns).toHaveBeenCalledWith(supabase, 'user-1', goals.runTypeRules)
    })

    it('keeps manual runs: reclassify is the only writer and it skips them', async () => {
        const { supabase } = makeFakeAdminDb(() => ok(ROW))
        createDBServerClientMock.mockResolvedValue(supabase)
        const reclassifyRuns = fakeReclassify(0)
        const goals = { ...GOALS, runTypeRules: { ...GOALS.runTypeRules, fastPaceSPerKm: 280 } }

        await Effect.runPromise(saveWeeklyGoals(USER, goals, { reclassifyRuns }))

        expect(reclassifyRuns).toHaveBeenCalledTimes(1)
        expect(reclassifyRuns.mock.calls[0]).toEqual([supabase, 'user-1', goals.runTypeRules])
    })

    it('does not upsert when reclassify fails, and the error propagates', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(ROW))
        createDBServerClientMock.mockResolvedValue(supabase)
        const reclassifyRuns = vi.fn(() =>
            Effect.fail(
                new ActivityWriteError({
                    cause: 'down',
                    error_hash: ErrorCode.ATHLETE_GOALS_SB_CLIENT,
                })
            )
        )
        const goals = { ...GOALS, runTypeRules: { ...GOALS.runTypeRules, longRunMinM: 8000 } }

        expect(
            failureTag(
                await Effect.runPromiseExit(saveWeeklyGoals(USER, goals, { reclassifyRuns }))
            )
        ).toBe('ActivityWriteError')
        expect(calls.some((call) => call.op === 'upsert')).toBe(false)
    })

    it('fails with WeeklyGoalsValidationError before creating a client', async () => {
        const goals = { ...GOALS, runTypeRules: { ...GOALS.runTypeRules, shortRunMaxM: 6000 } }

        expect(
            failureTag(
                await Effect.runPromiseExit(
                    saveWeeklyGoals(USER, goals, { reclassifyRuns: fakeReclassify(0) })
                )
            )
        ).toBe('WeeklyGoalsValidationError')
        expect(createDBServerClientMock).not.toHaveBeenCalled()
    })
})
