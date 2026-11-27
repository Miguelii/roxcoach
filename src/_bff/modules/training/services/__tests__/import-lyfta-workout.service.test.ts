// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { WeeklyGoalsQueryError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    DEFAULT_WEEKLY_GOALS,
    DEFAULT_RUN_TYPE_RULES,
} from '@/_bff/core/constants/weekly-goals.constants'
import { createImportContext } from '@/_bff/modules/training/services/import-context.service'
import { importLyftaWorkouts } from '@/_bff/modules/training/services/import-lyfta-workout.service'
import type { TrainingClient } from '@/_bff/modules/training/types'
import type { LyftaWorkout } from '@/_bff/modules/lyfta/types'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'

const RULES = { shortRunMaxM: 2000, longRunMinM: 8000, fastPaceSPerKm: 280 }
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
) => ({ supabase, timeZone, runTypeRules: DEFAULT_RUN_TYPE_RULES })

const SECOND: LyftaWorkout = { ...WORKOUT, sourceId: '1002', title: 'Lower Strength' }

describe('importLyftaWorkouts', () => {
    it('writes a page in four statements and replaces only the current user sets', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok([{ source_id: '1002' }]),
            ok([
                { id: ACTIVITY_ID, source_id: '1001' },
                { id: 'activity-lyfta-2', source_id: '1002' },
            ]),
            ok(),
            ok(),
        ])

        const result = await Effect.runPromise(
            importLyftaWorkouts(USER, [WORKOUT, SECOND], context(supabase))
        )

        expect(result).toEqual({ created: 1, updated: 1 })
        expect(from.mock.calls.map(([table]) => table)).toEqual([
            'activities',
            'activities',
            'strength_sets',
            'strength_sets',
        ])
        expect(chains[0]?.in).toHaveBeenCalledWith('source_id', ['1001', '1002'])
        expect(chains[1]?.upsert).toHaveBeenCalledWith(
            [
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
                expect.objectContaining({ source_id: '1002', name: 'Lower Strength' }),
            ],
            { onConflict: 'user_id,source,source_id', defaultToNull: false }
        )
        const upsertRow = chains[1]?.upsert.mock.calls[0]?.[0]?.[0]
        expect(upsertRow).not.toHaveProperty('notes')
        expect(upsertRow).not.toHaveProperty('perceived_effort')
        expect(chains[2]?.eq).toHaveBeenCalledWith('user_id', USER)
        expect(chains[2]?.in).toHaveBeenCalledWith('activity_id', [ACTIVITY_ID, 'activity-lyfta-2'])
        expect(chains[3]?.insert.mock.calls[0]?.[0]).toHaveLength(6)
        expect(chains[3]?.insert).toHaveBeenCalledWith(
            expect.arrayContaining([
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
                expect.objectContaining({ activity_id: 'activity-lyfta-2', set_index: 1 }),
            ])
        )
    })

    it('stores the records Lyfta flagged on a set and null for the other sets', async () => {
        const { chains, supabase } = makeFakeDb([
            ok([]),
            ok([{ id: ACTIVITY_ID, source_id: '1001' }]),
            ok(),
            ok(),
        ])
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

        await Effect.runPromise(importLyftaWorkouts(USER, [workout], context(supabase)))

        expect(chains[3]?.insert).toHaveBeenCalledWith([
            expect.objectContaining({ set_index: 1, lyfta_records: null }),
            expect.objectContaining({ set_index: 2, lyfta_records: records }),
        ])
    })

    it('does not query for an empty page', async () => {
        const { from, supabase } = makeFakeDb([])

        await expect(
            Effect.runPromise(importLyftaWorkouts(USER, [], context(supabase)))
        ).resolves.toEqual({ created: 0, updated: 0 })
        expect(from).not.toHaveBeenCalled()
    })

    it('reports a partial set replacement failure so a later sync can repair it', async () => {
        const { supabase } = makeFakeDb([
            ok([]),
            ok([{ id: ACTIVITY_ID, source_id: '1001' }]),
            ok(),
            { data: null, error: { code: 'XX001', message: 'set insert failed' } },
        ])

        const exit = await Effect.runPromiseExit(
            importLyftaWorkouts(USER, [WORKOUT], context(supabase))
        )

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })

    it('creates the import context once: valid timezone kept, invalid one falls back to UTC', async () => {
        const { supabase } = makeFakeDb([])
        const createClient = vi.fn(() => supabase)
        const getTimezone = vi.fn<(client: TrainingClient, userId: string) => void>()
        const getGoals = vi.fn<(client: TrainingClient, userId: string) => void>()
        const make = (timezone: string) =>
            Effect.runPromise(
                createImportContext(USER, {
                    createClient,
                    getTimezone: (client, userId) => {
                        getTimezone(client, userId)
                        return Effect.succeed(timezone)
                    },
                    getGoals: (client, userId) => {
                        getGoals(client, userId)
                        return Effect.succeed({ ...DEFAULT_WEEKLY_GOALS, runTypeRules: RULES })
                    },
                })
            )

        expect(await make('Europe/Lisbon')).toEqual({
            supabase,
            timeZone: 'Europe/Lisbon',
            runTypeRules: RULES,
        })
        expect((await make('Mars/Olympus')).timeZone).toBe('UTC')
        expect(createClient).toHaveBeenCalledTimes(2)
        expect(getTimezone).toHaveBeenCalledWith(supabase, USER)
    })

    it('createImportContext falls back to the default rules when the goals read fails', async () => {
        const { supabase } = makeFakeDb([])

        const created = await Effect.runPromise(
            createImportContext(USER, {
                createClient: () => supabase,
                getTimezone: () => Effect.succeed('UTC'),
                getGoals: () =>
                    Effect.fail(
                        new WeeklyGoalsQueryError({
                            cause: 'boom',
                            error_hash: ErrorCode.ATHLETE_GOALS_SELECT_ERR,
                        })
                    ),
            })
        )

        expect(created.runTypeRules).toEqual(DEFAULT_RUN_TYPE_RULES)
    })

    it('createImportContext loads the run type rules once', async () => {
        const { supabase } = makeFakeDb([])
        const getGoals = vi.fn(() =>
            Effect.succeed({ ...DEFAULT_WEEKLY_GOALS, runTypeRules: RULES })
        )

        const created = await Effect.runPromise(
            createImportContext(USER, {
                createClient: () => supabase,
                getTimezone: () => Effect.succeed('UTC'),
                getGoals,
            })
        )

        expect(created.runTypeRules).toEqual(RULES)
        expect(getGoals).toHaveBeenCalledTimes(1)
        expect(getGoals).toHaveBeenCalledWith(supabase, USER)
    })
})
