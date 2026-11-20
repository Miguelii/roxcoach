// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    deleteStrengthSets,
    insertStrengthSets,
    selectStrengthSets,
} from '@/_bff/modules/training/repositories/strength-sets.repository'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

const USER_ID = 'strength-user-1'
const ACTIVITY_ID = 'strength-activity-1'

describe('strength sets repository', () => {
    it('selects and converts sets using both ownership filters', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok([
                {
                    exercise: 'Bench Press',
                    exercise_index: 2,
                    exercise_image_url: 'https://lyfta.app/images/exercises/00251101.png',
                    source_exercise_id: '501',
                    set_index: 1,
                    reps: 5,
                    load_kg: '80',
                    rir: 2,
                    rpe: null,
                },
            ]),
        ])

        const result = await Effect.runPromise(selectStrengthSets(supabase, USER_ID, ACTIVITY_ID))

        expect(result).toEqual([
            {
                exercise: 'Bench Press',
                exerciseIndex: 2,
                exerciseImageUrl: 'https://lyfta.app/images/exercises/00251101.png',
                sourceExerciseId: '501',
                setIndex: 1,
                reps: 5,
                loadKg: 80,
                rir: 2,
                rpe: null,
            },
        ])
        expect(from).toHaveBeenCalledWith('strength_sets')
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(2, 'activity_id', ACTIVITY_ID)
        expect(chains[0]?.order).toHaveBeenCalledWith('exercise_index', { ascending: true })
    })

    it('deletes only the current user activity sets and inserts explicit ownership fields', async () => {
        const { chains, supabase } = makeFakeDb([ok(), ok()])
        const sets = [
            {
                exercise: 'Squat',
                exercise_index: 1,
                exercise_image_url: null,
                source_exercise_id: null,
                set_index: 1,
                reps: 8,
                load_kg: 50,
                rir: null,
                rpe: null,
            },
        ]

        await Effect.runPromise(deleteStrengthSets(supabase, USER_ID, ACTIVITY_ID))
        await Effect.runPromise(insertStrengthSets(supabase, USER_ID, ACTIVITY_ID, sets))

        expect(chains[0]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(2, 'activity_id', ACTIVITY_ID)
        expect(chains[1]?.insert).toHaveBeenCalledWith([
            {
                user_id: USER_ID,
                activity_id: ACTIVITY_ID,
                exercise: 'Squat',
                exercise_index: 1,
                exercise_image_url: null,
                source_exercise_id: null,
                set_index: 1,
                reps: 8,
                load_kg: 50,
                rir: null,
                rpe: null,
            },
        ])
    })

    it('does not send an empty insert and fails invalid returned rows', async () => {
        const empty = makeFakeDb([])
        await expect(
            Effect.runPromise(insertStrengthSets(empty.supabase, USER_ID, ACTIVITY_ID, []))
        ).resolves.toBeUndefined()
        expect(empty.from).not.toHaveBeenCalled()

        const invalid = makeFakeDb([ok([{ exercise: 'Bench Press', set_index: 1 }])])
        const exit = await Effect.runPromiseExit(
            selectStrengthSets(invalid.supabase, USER_ID, ACTIVITY_ID)
        )
        expect(failureTag(exit)).toBe('ActivityQueryError')
    })
})
