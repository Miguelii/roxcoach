import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import {
    countActivitiesBySource,
    deleteActivitiesBySource,
} from '@/_bff/modules/training/repositories/activities.repository'

const USER_ID = 'user-1'
const failed = { code: '42501', message: 'permission denied' }

describe('countActivitiesBySource', () => {
    it('counts the rows of one athlete and one source', async () => {
        const { chains, supabase } = makeFakeDb([{ data: null, count: 142, error: null }])

        const count = await Effect.runPromise(countActivitiesBySource(supabase, USER_ID, 'lyfta'))

        expect(count).toBe(142)
        expect(chains[0]?.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(2, 'source', 'lyfta')
    })

    it('reads a missing count as zero', async () => {
        const { supabase } = makeFakeDb([{ data: null, count: null, error: null }])

        const count = await Effect.runPromise(countActivitiesBySource(supabase, USER_ID, 'zepp'))

        expect(count).toBe(0)
    })

    it('fails with ActivityQueryError when the database answers an error', async () => {
        const { supabase } = makeFakeDb([{ data: null, error: failed }])

        const exit = await Effect.runPromiseExit(countActivitiesBySource(supabase, USER_ID, 'zepp'))

        expect(failureTag(exit)).toBe('ActivityQueryError')
    })
})

describe('deleteActivitiesBySource', () => {
    it('deletes the rows of one athlete and one source and returns how many', async () => {
        const { chains, supabase } = makeFakeDb([ok([{ id: 'a' }, { id: 'b' }, { id: 'c' }])])

        const deleted = await Effect.runPromise(deleteActivitiesBySource(supabase, USER_ID, 'zepp'))

        expect(deleted).toBe(3)
        expect(chains[0]?.delete).toHaveBeenCalledTimes(1)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(2, 'source', 'zepp')
    })

    it('returns zero, not an error, when there was nothing to delete', async () => {
        const { supabase } = makeFakeDb([ok([])])

        const deleted = await Effect.runPromise(
            deleteActivitiesBySource(supabase, USER_ID, 'lyfta')
        )

        expect(deleted).toBe(0)
    })

    it('fails with ActivityWriteError when the database answers an error', async () => {
        const { supabase } = makeFakeDb([{ data: null, error: failed }])

        const exit = await Effect.runPromiseExit(
            deleteActivitiesBySource(supabase, USER_ID, 'lyfta')
        )

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })
})
