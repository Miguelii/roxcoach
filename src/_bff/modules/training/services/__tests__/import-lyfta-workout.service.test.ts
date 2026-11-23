// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { createImportContext } from '@/_bff/modules/training/services/import-context.service'
import { importLyftaWorkout } from '@/_bff/modules/training/services/import-lyfta-workout.service'
import type { TrainingClient } from '@/_bff/modules/training/types'
import type { LyftaWorkout } from '@/_bff/modules/lyfta/types'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

const USER = 'user-training-1'
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
            imageUrl: 'https://lyfta.app/images/exercises/00251101.png',
            sets: [
                { setIndex: 1, reps: 5, loadKg: 80, rir: 2 },
                { setIndex: 2, reps: null, loadKg: null, rir: null },
            ],
        },
        {
            exerciseId: '502',
            name: 'Row',
            imageUrl: null,
            sets: [{ setIndex: 1, reps: 10, loadKg: 35, rir: 1 }],
        },
    ],
}

const context = (
    supabase: ReturnType<typeof makeFakeDb>['supabase'],
    timeZone = 'America/Los_Angeles'
) => ({ supabase, timeZone })

describe('importLyftaWorkout', () => {
    it('upserts the activity and replaces only the current user activity sets', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok(null),
            ok({ id: ACTIVITY_ID }),
            ok(),
            ok(),
        ])

        const result = await Effect.runPromise(importLyftaWorkout(USER, WORKOUT, context(supabase)))

        expect(result).toEqual({ activityId: ACTIVITY_ID, created: true })
        expect(from.mock.calls.map(([table]) => table)).toEqual([
            'activities',
            'activities',
            'strength_sets',
            'strength_sets',
        ])
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(2, 'source', 'lyfta')
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(3, 'source_id', '1001')
        expect(chains[1]?.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: USER,
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
        expect(chains[2]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER)
        expect(chains[2]?.eq).toHaveBeenNthCalledWith(2, 'activity_id', ACTIVITY_ID)
        expect(chains[3]?.insert).toHaveBeenCalledWith([
            {
                user_id: USER,
                activity_id: ACTIVITY_ID,
                exercise: 'Bench Press',
                exercise_index: 1,
                exercise_image_url: 'https://lyfta.app/images/exercises/00251101.png',
                source_exercise_id: '501',
                set_index: 1,
                reps: 5,
                load_kg: 80,
                rir: 2,
                rpe: null,
                lyfta_records: null,
            },
            {
                user_id: USER,
                activity_id: ACTIVITY_ID,
                exercise: 'Bench Press',
                exercise_index: 1,
                exercise_image_url: 'https://lyfta.app/images/exercises/00251101.png',
                source_exercise_id: '501',
                set_index: 2,
                reps: null,
                load_kg: null,
                rir: null,
                rpe: null,
                lyfta_records: null,
            },
            {
                user_id: USER,
                activity_id: ACTIVITY_ID,
                exercise: 'Row',
                exercise_index: 2,
                exercise_image_url: null,
                source_exercise_id: '502',
                set_index: 1,
                reps: 10,
                load_kg: 35,
                rir: 1,
                rpe: null,
                lyfta_records: null,
            },
        ])
    })

    it('stores the records Lyfta flagged on a set and null for the other sets', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok({ id: ACTIVITY_ID }), ok(), ok()])
        const records = [
            { type: 1, level: 1, value: 20 },
            { type: 3, level: 1, value: 135 },
        ]
        const workout: LyftaWorkout = {
            ...WORKOUT,
            exercises: [
                {
                    exerciseId: '1511',
                    name: 'Skull Crusher',
                    imageUrl: null,
                    sets: [
                        { setIndex: 1, reps: 10, loadKg: 10, rir: null },
                        { setIndex: 2, reps: 9, loadKg: 15, rir: null, records },
                    ],
                },
            ],
        }

        await Effect.runPromise(importLyftaWorkout(USER, workout, context(supabase)))

        expect(chains[3]?.insert).toHaveBeenCalledWith([
            expect.objectContaining({ set_index: 1, lyfta_records: null }),
            expect.objectContaining({ set_index: 2, lyfta_records: records }),
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
            Effect.runPromise(importLyftaWorkout(USER, WORKOUT, context(supabase)))
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
            importLyftaWorkout(USER, WORKOUT, context(supabase))
        )

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })

    it('creates the import context once: valid timezone kept, invalid one falls back to UTC', async () => {
        const { supabase } = makeFakeDb([])
        const createClient = vi.fn(() => supabase)
        const getTimezone = vi.fn<(client: TrainingClient, userId: string) => void>()
        const make = (timezone: string) =>
            Effect.runPromise(
                createImportContext(USER, {
                    createClient,
                    getTimezone: (client, userId) => {
                        getTimezone(client, userId)
                        return Effect.succeed(timezone)
                    },
                })
            )

        expect(await make('Europe/Lisbon')).toEqual({ supabase, timeZone: 'Europe/Lisbon' })
        expect((await make('Mars/Olympus')).timeZone).toBe('UTC')
        expect(createClient).toHaveBeenCalledTimes(2)
        expect(getTimezone).toHaveBeenCalledWith(supabase, USER)
    })
})
