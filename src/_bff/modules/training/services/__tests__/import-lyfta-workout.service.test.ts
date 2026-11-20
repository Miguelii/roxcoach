// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { importLyftaWorkout } from '@/_bff/modules/training/services/import-lyfta-workout.service'
import type { LyftaWorkout } from '@/_bff/modules/lyfta/types'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

// SAFETY: The import service only reads the authenticated user's ID.
const USER = { id: 'user-training-1' } as User
const ACTIVITY_ID = 'activity-lyfta-1'
const WORKOUT: LyftaWorkout = {
    sourceId: '1001',
    title: 'Upper Strength',
    startedAt: '2026-08-20T17:05:00.000Z',
    durationSeconds: 2710,
    bodyWeightKg: 72.5,
    totalVolumeKgReps: 1840,
    exercises: [
        {
            exerciseId: '501',
            name: 'Bench Press',
            sets: [
                { setIndex: 1, reps: 5, loadKg: 80, rir: 2 },
                { setIndex: 2, reps: null, loadKg: null, rir: null },
            ],
        },
        {
            exerciseId: '502',
            name: 'Row',
            sets: [{ setIndex: 1, reps: 10, loadKg: 35, rir: 1 }],
        },
    ],
}

const dependencies = (
    supabase: ReturnType<typeof makeFakeDb>['supabase'],
    timeZone = 'America/Los_Angeles'
) => ({
    createUserClient: vi.fn(async () => supabase),
    getTimezone: vi.fn(() => Effect.succeed(timeZone)),
})

describe('importLyftaWorkout', () => {
    it('upserts the activity and replaces only the current user activity sets', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok(null),
            ok({ id: ACTIVITY_ID }),
            ok(),
            ok(),
        ])

        const result = await Effect.runPromise(
            importLyftaWorkout(USER, WORKOUT, dependencies(supabase))
        )

        expect(result).toEqual({ activityId: ACTIVITY_ID, created: true })
        expect(from.mock.calls.map(([table]) => table)).toEqual([
            'activities',
            'activities',
            'strength_sets',
            'strength_sets',
        ])
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER.id)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(2, 'source', 'lyfta')
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(3, 'source_id', '1001')
        expect(chains[1]?.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: USER.id,
                source: 'lyfta',
                source_id: '1001',
                category: 'strength',
                sport_type: 'strength',
                name: 'Upper Strength',
                started_at: WORKOUT.startedAt,
                local_date: '2026-08-20',
                distance_m: null,
                elapsed_time_s: 2710,
                body_weight_kg: 72.5,
                lyfta_total_volume_kg_reps: 1840,
            }),
            { onConflict: 'user_id,source,source_id', defaultToNull: false }
        )
        const upsertPayload = chains[1]?.upsert.mock.calls[0]?.[0]
        expect(upsertPayload).not.toHaveProperty('notes')
        expect(upsertPayload).not.toHaveProperty('perceived_effort')
        expect(chains[2]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER.id)
        expect(chains[2]?.eq).toHaveBeenNthCalledWith(2, 'activity_id', ACTIVITY_ID)
        expect(chains[3]?.insert).toHaveBeenCalledWith([
            {
                user_id: USER.id,
                activity_id: ACTIVITY_ID,
                exercise: 'Bench Press',
                source_exercise_id: '501',
                set_index: 1,
                reps: 5,
                load_kg: 80,
                rir: 2,
                rpe: null,
            },
            {
                user_id: USER.id,
                activity_id: ACTIVITY_ID,
                exercise: 'Bench Press',
                source_exercise_id: '501',
                set_index: 2,
                reps: null,
                load_kg: null,
                rir: null,
                rpe: null,
            },
            {
                user_id: USER.id,
                activity_id: ACTIVITY_ID,
                exercise: 'Row',
                source_exercise_id: '502',
                set_index: 1,
                reps: 10,
                load_kg: 35,
                rir: 1,
                rpe: null,
            },
        ])
    })

    it('returns an update result for a known source ID and still replaces its sets', async () => {
        const { supabase } = makeFakeDb([
            ok({ id: ACTIVITY_ID }),
            ok({ id: ACTIVITY_ID }),
            ok(),
            ok(),
        ])

        await expect(
            Effect.runPromise(importLyftaWorkout(USER, WORKOUT, dependencies(supabase)))
        ).resolves.toEqual({ activityId: ACTIVITY_ID, created: false })
    })

    it('reports a partial set replacement failure so a later sync can repair it', async () => {
        const { supabase } = makeFakeDb([
            ok(null),
            ok({ id: ACTIVITY_ID }),
            ok(),
            { data: null, error: { code: 'XX001', message: 'set insert failed' } },
        ])

        const exit = await Effect.runPromiseExit(
            importLyftaWorkout(USER, WORKOUT, dependencies(supabase))
        )

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })
})
