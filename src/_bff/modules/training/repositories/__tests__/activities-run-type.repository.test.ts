import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import {
    ACTIVITY_ID,
    DB_ROW,
    DTO,
} from '@/_bff/modules/training/repositories/__tests__/activity-fixtures'
import {
    selectActivityById,
    selectRunsForReclassify,
    setActivityRunType,
    updateRunTypes,
} from '@/_bff/modules/training/repositories/activities.repository'

const USER_ID = 'user-1'
const failed = { code: '42501', message: 'permission denied' }

describe('run type columns', () => {
    it('maps run_type and run_type_manual into the DTO', async () => {
        const { supabase } = makeFakeDb([
            ok({ ...DB_ROW, run_type: 'long', run_type_manual: true }),
        ])

        const result = await Effect.runPromise(selectActivityById(supabase, USER_ID, ACTIVITY_ID))

        expect(result).toEqual({ ...DTO, runType: 'long', runTypeManual: true })
    })
})

describe('setActivityRunType', () => {
    it('setActivityRunType filters by id, user_id and category run and returns false when nothing matched', async () => {
        const hit = makeFakeDb([ok([{ id: ACTIVITY_ID }])])
        const miss = makeFakeDb([ok([])])
        const value = { runType: 'fast' as const, manual: true }

        await expect(
            Effect.runPromise(setActivityRunType(hit.supabase, USER_ID, ACTIVITY_ID, value))
        ).resolves.toBe(true)
        await expect(
            Effect.runPromise(setActivityRunType(miss.supabase, USER_ID, ACTIVITY_ID, value))
        ).resolves.toBe(false)

        const chain = hit.chains[0]
        expect(chain?.update).toHaveBeenCalledWith({ run_type: 'fast', run_type_manual: true })
        expect(chain?.eq).toHaveBeenCalledWith('id', ACTIVITY_ID)
        expect(chain?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chain?.eq).toHaveBeenCalledWith('category', 'run')
        expect(chain?.is).toHaveBeenCalledWith('deleted_at', null)
        expect(chain?.select).toHaveBeenCalledWith('id')
    })

    it('tags a returned error as ActivityWriteError', async () => {
        const { supabase } = makeFakeDb([{ data: null, error: failed }])
        const exit = await Effect.runPromiseExit(
            setActivityRunType(supabase, USER_ID, ACTIVITY_ID, { runType: null, manual: false })
        )
        expect(failureTag(exit)).toBe('ActivityWriteError')
    })
})

describe('updateRunTypes', () => {
    it('updateRunTypes makes no call for an empty id list', async () => {
        const { from, supabase } = makeFakeDb([])

        await Effect.runPromise(updateRunTypes(supabase, USER_ID, [], 'long'))

        expect(from).not.toHaveBeenCalled()
    })

    it('updates the ids of the user', async () => {
        const { chains, supabase } = makeFakeDb([ok()])

        await Effect.runPromise(updateRunTypes(supabase, USER_ID, ['a', 'b'], null))

        expect(chains[0]?.update).toHaveBeenCalledWith({ run_type: null })
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.in).toHaveBeenCalledWith('id', ['a', 'b'])
    })
})

describe('selectRunsForReclassify', () => {
    it('reads the live automatic runs of the user', async () => {
        const { chains, supabase } = makeFakeDb([
            ok([
                {
                    id: 'a',
                    distance_m: 5000,
                    moving_time_s: 1450,
                    elapsed_time_s: null,
                    run_type: 'fast',
                },
            ]),
        ])

        const result = await Effect.runPromise(selectRunsForReclassify(supabase, USER_ID))

        expect(result).toEqual([
            { id: 'a', distanceM: 5000, movingTimeS: 1450, elapsedTimeS: null, runType: 'fast' },
        ])
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenCalledWith('category', 'run')
        expect(chains[0]?.eq).toHaveBeenCalledWith('run_type_manual', false)
        expect(chains[0]?.is).toHaveBeenCalledWith('deleted_at', null)
    })
})
