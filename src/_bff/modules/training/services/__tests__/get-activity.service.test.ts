// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import { getActivity } from '@/_bff/modules/training/services/get-activity.service'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User
const ID = '7a1f0f4e-3b0e-4c53-9a0a-6a3a3d2f9c11'

const DB_ROW = {
    id: ID,
    source: 'manual',
    category: 'hyrox',
    name: 'Hyrox session',
    started_at: '2026-11-18T07:30:00+00:00',
    local_date: '2026-11-18',
    distance_m: 8000,
    moving_time_s: 4000,
    elapsed_time_s: 4100,
    elevation_gain_m: null,
    avg_hr: null,
    max_hr: null,
    avg_speed_mps: null,
    calories: null,
    body_weight_kg: null,
    lyfta_total_volume_kg_reps: null,
    perceived_effort: null,
    notes: null,
}

const DB_LAP = {
    lap_index: 1,
    name: 'Lap 1',
    distance_m: 1000,
    elapsed_time_s: 300,
    moving_time_s: 295,
    avg_hr: null,
    avg_speed_mps: null,
    station: 'ski_erg',
}

const DB_STRENGTH_SET = {
    exercise: 'Bench Press',
    exercise_index: 1,
    exercise_image_url: 'https://lyfta.app/images/exercises/00251101.png',
    source_exercise_id: '501',
    set_index: 1,
    reps: 5,
    load_kg: 80,
    rir: 2,
    rpe: null,
}

describe('getActivity', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('returns the activity with its laps, read as the signed-in user', async () => {
        const { chains, from, supabase } = makeFakeDb([
            { data: DB_ROW, error: null },
            { data: [DB_LAP], error: null },
            { data: [DB_STRENGTH_SET], error: null },
        ])
        createDBServerClientMock.mockResolvedValue(supabase)

        const result = await Effect.runPromise(getActivity(USER, ID))

        expect(result?.activity.id).toBe(ID)
        expect(result?.laps).toHaveLength(1)
        expect(result?.laps[0]?.station).toBe('ski_erg')
        expect(result?.strengthSets).toEqual([
            {
                exercise: 'Bench Press',
                exerciseIndex: 1,
                exerciseImageUrl: 'https://lyfta.app/images/exercises/00251101.png',
                sourceExerciseId: '501',
                setIndex: 1,
                reps: 5,
                loadKg: 80,
                rir: 2,
                rpe: null,
                lyftaRecords: [],
            },
        ])
        expect(from.mock.calls.map(([table]) => table)).toEqual([
            'activities',
            'activity_laps',
            'strength_sets',
        ])
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
        expect(chains[1]?.eq).toHaveBeenCalledWith('activity_id', ID)
        expect(chains[2]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
        expect(chains[2]?.eq).toHaveBeenCalledWith('activity_id', ID)
    })

    it('compares a strength workout with the earlier ones of the same athlete', async () => {
        const { chains, from, supabase } = makeFakeDb([
            { data: { ...DB_ROW, category: 'strength' }, error: null },
            { data: [], error: null },
            { data: [DB_STRENGTH_SET], error: null },
            { data: [{ id: 'earlier', local_date: '2026-11-09' }], error: null },
            {
                data: [
                    {
                        activity_id: 'earlier',
                        exercise: 'Bench Press',
                        exercise_image_url: null,
                        source_exercise_id: '501',
                        reps: 5,
                        load_kg: 75,
                    },
                ],
                error: null,
            },
        ])
        createDBServerClientMock.mockResolvedValue(supabase)

        const result = await Effect.runPromise(getActivity(USER, ID))

        expect(result?.strengthComparisons).toEqual([
            {
                key: '501',
                previous: { localDate: '2026-11-09', topSetKg: 75, topSetReps: 5, volumeKg: 375 },
                bestPriorTopSetKg: 75,
                bestPriorE1rmKg: 87.5,
                bestPriorVolumeKg: 375,
            },
        ])
        expect(from.mock.calls.map(([table]) => table)).toEqual([
            'activities',
            'activity_laps',
            'strength_sets',
            'activities',
            'strength_sets',
        ])
        expect(chains[3]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
        expect(chains[3]?.lt).toHaveBeenCalledWith('started_at', '2026-11-18T07:30:00+00:00')
    })

    it('skips the comparison for a non-strength activity', async () => {
        const { from, supabase } = makeFakeDb([
            { data: DB_ROW, error: null },
            { data: [], error: null },
            { data: [DB_STRENGTH_SET], error: null },
        ])
        createDBServerClientMock.mockResolvedValue(supabase)

        const result = await Effect.runPromise(getActivity(USER, ID))

        expect(result?.strengthComparisons).toEqual([])
        expect(from).toHaveBeenCalledTimes(3)
    })

    // Laps and sets are read alongside the activity, not after it, so a miss still issues all three.
    it('returns null for a missing (or soft-deleted) id without the strength comparison', async () => {
        const { from, supabase } = makeFakeDb([
            { data: null, error: null },
            { data: [], error: null },
            { data: [DB_STRENGTH_SET], error: null },
        ])
        createDBServerClientMock.mockResolvedValue(supabase)

        const result = await Effect.runPromise(getActivity(USER, ID))

        expect(result).toBeNull()
        expect(from.mock.calls.map(([table]) => table)).toEqual([
            'activities',
            'activity_laps',
            'strength_sets',
        ])
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no cookies'))

        const exit = await Effect.runPromiseExit(getActivity(USER, ID))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })

    it('fails with ActivityQueryError when the activity or the laps read fails', async () => {
        const activityFails = makeFakeDb([new Error('boom')])
        createDBServerClientMock.mockResolvedValue(activityFails.supabase)
        const first = await Effect.runPromiseExit(getActivity(USER, ID))

        const lapsFail = makeFakeDb([{ data: DB_ROW, error: null }, new Error('boom')])
        createDBServerClientMock.mockResolvedValue(lapsFail.supabase)
        const second = await Effect.runPromiseExit(getActivity(USER, ID))

        const setsFail = makeFakeDb([
            { data: DB_ROW, error: null },
            { data: [DB_LAP], error: null },
            new Error('boom'),
        ])
        createDBServerClientMock.mockResolvedValue(setsFail.supabase)
        const third = await Effect.runPromiseExit(getActivity(USER, ID))

        expect(failureTag(first)).toBe('ActivityQueryError')
        expect(failureTag(second)).toBe('ActivityQueryError')
        expect(failureTag(third)).toBe('ActivityQueryError')
    })
})
