// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { getAthleteTimezoneWithClient } from '@/_bff/modules/athlete/services/get-athlete-timezone-with-client.service'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'

describe('getAthleteTimezoneWithClient', () => {
    it('reads the timezone of the given user with the given client', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok({ timezone: 'Europe/Madrid' }))

        const timezone = await Effect.runPromise(getAthleteTimezoneWithClient(supabase, 'user-7'))

        expect(timezone).toBe('Europe/Madrid')
        expect(calls[0]?.table).toBe('athlete_profiles')
        expect(calls[0]?.filters).toEqual([['user_id', 'user-7']])
    })

    it('falls back to the default timezone without a profile', async () => {
        const { supabase } = makeFakeAdminDb(() => ok(null))

        const timezone = await Effect.runPromise(getAthleteTimezoneWithClient(supabase, 'user-7'))

        expect(timezone).toBe('Europe/Lisbon')
    })

    it('fails with ProfileQueryError when the read fails', async () => {
        const { supabase } = makeFakeAdminDb(() => new Error('boom'))

        const exit = await Effect.runPromiseExit(getAthleteTimezoneWithClient(supabase, 'user-7'))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })
})
