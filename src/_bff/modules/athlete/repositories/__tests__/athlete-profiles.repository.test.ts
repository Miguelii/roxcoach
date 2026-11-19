import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { selectTimezone } from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'
import { makeFakeAdminDb, ok } from '@/_bff/modules/strava/services/__tests__/fake-admin-db'

describe('selectTimezone', () => {
    it('returns the profile timezone, filtered by user_id', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok({ timezone: 'America/Sao_Paulo' }))

        const timezone = await Effect.runPromise(selectTimezone(supabase, 'user-1'))

        expect(timezone).toBe('America/Sao_Paulo')
        expect(calls[0]?.table).toBe('athlete_profiles')
        expect(calls[0]?.filters).toEqual([['user_id', 'user-1']])
    })

    it('returns Europe/Lisbon when there is no profile row', async () => {
        const { supabase } = makeFakeAdminDb(() => ok(null))

        const timezone = await Effect.runPromise(selectTimezone(supabase, 'user-1'))

        expect(timezone).toBe('Europe/Lisbon')
    })

    it('fails with ProfileQueryError on a returned error', async () => {
        const { supabase } = makeFakeAdminDb(() => ({
            data: null,
            error: { code: '42501', message: 'denied' },
        }))

        const exit = await Effect.runPromiseExit(selectTimezone(supabase, 'user-1'))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })

    it('fails with ProfileQueryError when the query rejects', async () => {
        const { supabase } = makeFakeAdminDb(() => new Error('network down'))

        const exit = await Effect.runPromiseExit(selectTimezone(supabase, 'user-1'))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })

    it('fails with ProfileQueryError on a malformed row', async () => {
        const { supabase } = makeFakeAdminDb(() => ok({ timezone: 42 }))

        const exit = await Effect.runPromiseExit(selectTimezone(supabase, 'user-1'))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })
})
