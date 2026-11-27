// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { DEFAULT_RUN_TYPE_RULES } from '@/_bff/core/constants/weekly-goals.constants'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import { reclassifyRuns } from '@/_bff/modules/training/services/reclassify-runs.service'

const USER_ID = 'user-1'

const row = (id: string, distance: number, time: number, runType: string | null) => ({
    id,
    distance_m: distance,
    moving_time_s: time,
    elapsed_time_s: null,
    run_type: runType,
})

describe('reclassifyRuns', () => {
    it('updates only runs whose type changed, one call per new type, and returns the count', async () => {
        const { chains, supabase } = makeFakeDb([
            ok([
                row('a', 5100, 1708, 'fast'),
                row('b', 5000, 1450, 'fast'),
                row('c', 2500, 900, 'long'),
            ]),
            ok(),
            ok(),
        ])

        const result = await Effect.runPromise(
            reclassifyRuns(supabase, USER_ID, DEFAULT_RUN_TYPE_RULES)
        )

        expect(result).toBe(2)
        const updates = chains.slice(1).map((chain) => {
            const update: unknown[][] = chain.update.mock.calls
            const ids: unknown[][] = chain.in.mock.calls
            return [update[0]?.[0], ids[0]?.[1]]
        })
        expect(updates).toEqual([
            [{ run_type: 'long' }, ['a']],
            [{ run_type: null }, ['c']],
        ])
        expect(chains).toHaveLength(3)
    })

    it('makes no update when nothing changed', async () => {
        const { chains, supabase } = makeFakeDb([ok([row('b', 5000, 1450, 'fast')])])

        const result = await Effect.runPromise(
            reclassifyRuns(supabase, USER_ID, DEFAULT_RUN_TYPE_RULES)
        )

        expect(result).toBe(0)
        expect(chains).toHaveLength(1)
    })
})
