// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import {
    selectRunsInRange,
    selectStrengthWorkoutsInRange,
} from '@/_bff/modules/training/repositories/activities.repository'
import { selectSetsForActivities } from '@/_bff/modules/training/repositories/strength-sets.repository'

const USER_ID = 'user-1'

// SAFETY: the fake only carries rows through; a jsonb column is not a flat FakeRow value.
const okRows = (rows: unknown[]) => ok(rows as never)

describe('selectRunsInRange', () => {
    it('filters by user, category, deletion and bounds and parses the histogram', async () => {
        const { chains, from, supabase } = makeFakeDb([
            okRows([
                {
                    local_date: '2026-11-10',
                    distance_m: '10000',
                    moving_time_s: 3000,
                    hr_histogram: { v: 1, bins: [[150, 10, 30]] },
                },
            ]),
        ])
        const rows = await Effect.runPromise(
            selectRunsInRange(supabase, USER_ID, '2026-08-21', '2026-11-21')
        )

        expect(from).toHaveBeenCalledWith('activities')
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenCalledWith('category', 'run')
        expect(chains[0]?.is).toHaveBeenCalledWith('deleted_at', null)
        expect(chains[0]?.gte).toHaveBeenCalledWith('local_date', '2026-08-21')
        expect(chains[0]?.lte).toHaveBeenCalledWith('local_date', '2026-11-21')
        expect(chains[0]?.order).toHaveBeenCalledWith('started_at', { ascending: true })
        expect(rows).toEqual([
            {
                localDate: '2026-11-10',
                distanceM: 10000,
                movingTimeS: 3000,
                hrHistogram: { v: 1, bins: [[150, 10, 30]] },
            },
        ])
    })

    it('turns a corrupt or missing histogram into null without failing', async () => {
        const base = { local_date: '2026-11-10', distance_m: 5000, moving_time_s: 1500 }
        const { supabase } = makeFakeDb([
            okRows([
                { ...base, hr_histogram: { v: 9, bins: 'nope' } },
                { ...base, hr_histogram: null },
            ]),
        ])
        const rows = await Effect.runPromise(selectRunsInRange(supabase, USER_ID, 'a', 'b'))

        expect(rows.map((row) => row.hrHistogram)).toEqual([null, null])
    })

    it('tags thrown, returned and malformed results as ActivityQueryError', async () => {
        const run = (queue: Parameters<typeof makeFakeDb>[0]) =>
            Effect.runPromiseExit(selectRunsInRange(makeFakeDb(queue).supabase, USER_ID, 'a', 'b'))
        expect(failureTag(await run([new Error('x')]))).toBe('ActivityQueryError')
        expect(
            failureTag(await run([{ data: null, error: { code: '42501', message: 'denied' } }]))
        ).toBe('ActivityQueryError')
        expect(failureTag(await run([okRows([{ nope: 1 }])]))).toBe('ActivityQueryError')
    })
})

describe('selectStrengthWorkoutsInRange', () => {
    it('filters by user, strength category, deletion and bounds', async () => {
        const { chains, supabase } = makeFakeDb([
            okRows([{ id: 'w1', local_date: '2026-11-10', body_weight_kg: '82.5' }]),
        ])
        const rows = await Effect.runPromise(
            selectStrengthWorkoutsInRange(supabase, USER_ID, '2026-08-21', '2026-11-21')
        )

        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenCalledWith('category', 'strength')
        expect(chains[0]?.is).toHaveBeenCalledWith('deleted_at', null)
        expect(chains[0]?.gte).toHaveBeenCalledWith('local_date', '2026-08-21')
        expect(chains[0]?.lte).toHaveBeenCalledWith('local_date', '2026-11-21')
        expect(chains[0]?.order).toHaveBeenCalledWith('started_at', { ascending: true })
        expect(rows).toEqual([{ activityId: 'w1', localDate: '2026-11-10', bodyWeightKg: 82.5 }])
    })

    it('tags thrown, returned and malformed results as ActivityQueryError', async () => {
        const run = (queue: Parameters<typeof makeFakeDb>[0]) =>
            Effect.runPromiseExit(
                selectStrengthWorkoutsInRange(makeFakeDb(queue).supabase, USER_ID, 'a', 'b')
            )
        expect(failureTag(await run([new Error('x')]))).toBe('ActivityQueryError')
        expect(
            failureTag(await run([{ data: null, error: { code: '42501', message: 'denied' } }]))
        ).toBe('ActivityQueryError')
        expect(failureTag(await run([okRows([{ nope: 1 }])]))).toBe('ActivityQueryError')
    })
})

describe('selectSetsForActivities', () => {
    it('does not query without ids', async () => {
        const { from, supabase } = makeFakeDb([ok([])])
        const rows = await Effect.runPromise(selectSetsForActivities(supabase, USER_ID, []))

        expect(rows).toEqual([])
        expect(from).not.toHaveBeenCalled()
    })

    it('filters by user and maps the rows', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok([
                {
                    activity_id: 'w1',
                    exercise: 'Squat',
                    source_exercise_id: '7',
                    reps: 5,
                    load_kg: '100',
                },
            ]),
        ])
        const rows = await Effect.runPromise(selectSetsForActivities(supabase, USER_ID, ['w1']))

        expect(from).toHaveBeenCalledWith('strength_sets')
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.in).toHaveBeenCalledWith('activity_id', ['w1'])
        expect(rows).toEqual([
            { activityId: 'w1', exercise: 'Squat', sourceExerciseId: '7', reps: 5, loadKg: 100 },
        ])
    })

    it('splits 250 ids into three queries of at most 100', async () => {
        const ids = Array.from({ length: 250 }, (_, index) => `a${index}`)
        const { chains, from, supabase } = makeFakeDb([ok([])])
        await Effect.runPromise(selectSetsForActivities(supabase, USER_ID, ids))

        expect(from).toHaveBeenCalledTimes(3)
        const sizes = chains.map((chain) => {
            const calls: unknown[][] = chain.in.mock.calls
            const ids = calls[0]?.[1]
            return Array.isArray(ids) ? ids.length : -1
        })
        expect(sizes).toEqual([100, 100, 50])
        for (const chain of chains) expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID)
    })

    it('tags thrown, returned and malformed results as ActivityQueryError', async () => {
        const run = (queue: Parameters<typeof makeFakeDb>[0]) =>
            Effect.runPromiseExit(
                selectSetsForActivities(makeFakeDb(queue).supabase, USER_ID, ['w1'])
            )
        expect(failureTag(await run([new Error('x')]))).toBe('ActivityQueryError')
        expect(
            failureTag(await run([{ data: null, error: { code: '42501', message: 'denied' } }]))
        ).toBe('ActivityQueryError')
        expect(failureTag(await run([ok([{ nope: 1 }])]))).toBe('ActivityQueryError')
    })
})
