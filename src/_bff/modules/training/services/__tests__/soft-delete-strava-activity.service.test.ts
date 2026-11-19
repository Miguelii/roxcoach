import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import { softDeleteStravaActivity } from '@/_bff/modules/training/services/soft-delete-strava-activity.service'

describe('softDeleteStravaActivity', () => {
    it('soft-deletes the strava activity of the user', async () => {
        const { chains, supabase } = makeFakeDb([{ data: null, error: null }])

        await Effect.runPromise(softDeleteStravaActivity(supabase, 'user-1', 555))

        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
        expect(chains[0]?.eq).toHaveBeenCalledWith('strava_id', 555)
        expect(chains[0]?.update).toHaveBeenCalled()
    })

    it('fails with ActivityWriteError when the write fails', async () => {
        const { supabase } = makeFakeDb([new Error('boom')])

        const exit = await Effect.runPromiseExit(softDeleteStravaActivity(supabase, 'user-1', 555))

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })
})
