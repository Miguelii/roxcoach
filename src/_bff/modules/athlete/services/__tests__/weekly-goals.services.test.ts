// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { DEFAULT_WEEKLY_GOALS } from '@/_bff/core/constants/weekly-goals.constants'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    getWeeklyGoals,
    getWeeklyGoalsWithClient,
} from '@/_bff/modules/athlete/services/get-weekly-goals.service'
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
