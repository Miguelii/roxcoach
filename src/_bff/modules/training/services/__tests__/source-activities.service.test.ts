// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import {
    clearSourceActivities,
    countSourceActivities,
} from '@/_bff/modules/training/services/source-activities.service'

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User

const failingClient = async () => {
    throw new Error('no cookies')
}

describe('source activities service', () => {
    it('counts with the athlete client and the user id', async () => {
        const { chains, supabase } = makeFakeDb([{ data: null, count: 5, error: null }])
        const createClient = vi.fn(async () => supabase)

        const count = await Effect.runPromise(
            countSourceActivities(USER, 'lyfta', { createClient })
        )

        expect(count).toBe(5)
        expect(createClient).toHaveBeenCalledTimes(1)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1')
    })

    it('clears with the athlete client and returns how many were deleted', async () => {
        const { chains, supabase } = makeFakeDb([ok([{ id: 'a' }, { id: 'b' }])])
        const createClient = vi.fn(async () => supabase)

        const deleted = await Effect.runPromise(
            clearSourceActivities(USER, 'zepp', { createClient })
        )

        expect(deleted).toBe(2)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(2, 'source', 'zepp')
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        const exit = await Effect.runPromiseExit(
            clearSourceActivities(USER, 'lyfta', { createClient: failingClient })
        )

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})
