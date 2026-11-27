// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { DEFAULT_RUN_TYPE_RULES } from '@/_bff/core/constants/weekly-goals.constants'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import { DB_ROW } from '@/_bff/modules/training/repositories/__tests__/activity-fixtures'
import { setRunType } from '@/_bff/modules/training/services/set-run-type.service'

// SAFETY: the service only reads `user.id`.
const USER = { id: 'user-1' } as User
const ID = '7a1f0f4e-3b0e-4c53-9a0a-6a3a3d2f9c11'

const setup = (queue: Parameters<typeof makeFakeDb>[0]) => {
    const db = makeFakeDb(queue)
    const deps = {
        createClient: () => Effect.succeed(db.supabase),
        getRunTypeRules: () => Effect.succeed({ ...DEFAULT_RUN_TYPE_RULES, longRunMinM: 4000 }),
    }
    return { db, deps }
}

describe('setRunType', () => {
    it.each([
        ['long', 'long', true],
        ['fast', 'fast', true],
        ['none', null, true],
    ] as const)('stores %s as manual', async (input, runType, manual) => {
        const { db, deps } = setup([ok([{ id: ID }])])

        const result = await Effect.runPromise(
            setRunType(USER, { activityId: ID, runType: input }, deps)
        )

        expect(result).toEqual({ runType, runTypeManual: manual })
        expect(db.chains[0]?.update).toHaveBeenCalledWith({
            run_type: runType,
            run_type_manual: manual,
        })
        expect(db.chains[0]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
    })

    it('auto clears the manual flag and recomputes the type with the athlete rules', async () => {
        const { db, deps } = setup([
            ok({
                ...DB_ROW,
                distance_m: 5000,
                moving_time_s: 1450,
                run_type: 'fast',
                run_type_manual: true,
            }),
            ok([{ id: ID }]),
        ])

        const result = await Effect.runPromise(
            setRunType(USER, { activityId: ID, runType: 'auto' }, deps)
        )

        // 5000 m is over the athlete's 4000 m long run threshold.
        expect(result).toEqual({ runType: 'long', runTypeManual: false })
        expect(db.chains[1]?.update).toHaveBeenCalledWith({
            run_type: 'long',
            run_type_manual: false,
        })
    })

    it('fails with the not found error for a non run or another user activity', async () => {
        const manual = setup([ok([])])
        const auto = setup([ok(null)])

        const manualExit = await Effect.runPromiseExit(
            setRunType(USER, { activityId: ID, runType: 'long' }, manual.deps)
        )
        const autoExit = await Effect.runPromiseExit(
            setRunType(USER, { activityId: ID, runType: 'auto' }, auto.deps)
        )

        expect(failureTag(manualExit)).toBe('ActivityNotFoundError')
        expect(failureTag(autoExit)).toBe('ActivityNotFoundError')
    })
})
