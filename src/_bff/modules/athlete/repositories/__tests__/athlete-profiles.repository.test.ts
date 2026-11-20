import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    selectProfile,
    selectTimezone,
    upsertProfile,
} from '@/_bff/modules/athlete/repositories/athlete-profiles.repository'
import type { ProfileInput } from '@/_bff/modules/athlete/types'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'

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

const ROW = {
    display_name: 'Ana',
    timezone: 'Europe/Madrid',
    max_hr: 190,
    resting_hr: '50',
    hyrox_division: 'pro_women',
    weekly_hours_cap: '7.5',
    notes: null,
}

describe('selectProfile', () => {
    it('maps the row to camelCase, parsing numeric strings and keeping nulls', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok(ROW))

        const profile = await Effect.runPromise(selectProfile(supabase, 'user-1'))

        expect(profile).toEqual({
            displayName: 'Ana',
            timezone: 'Europe/Madrid',
            maxHr: 190,
            restingHr: 50,
            hyroxDivision: 'pro_women',
            weeklyHoursCap: 7.5,
            notes: null,
        })
        expect(calls[0]?.filters).toEqual([['user_id', 'user-1']])
    })

    it('returns null without a row', async () => {
        const { supabase } = makeFakeAdminDb(() => ok(null))

        expect(await Effect.runPromise(selectProfile(supabase, 'user-1'))).toBeNull()
    })

    it('fails with ProfileQueryError on returned, thrown and malformed results', async () => {
        const returned = makeFakeAdminDb(() => ({ data: null, error: { code: '1', message: 'x' } }))
        const thrown = makeFakeAdminDb(() => new Error('down'))
        const malformed = makeFakeAdminDb(() => ok({ ...ROW, hyrox_division: 'masters' }))

        const exits = await Promise.all(
            [returned, thrown, malformed].map(({ supabase }) =>
                Effect.runPromiseExit(selectProfile(supabase, 'user-1'))
            )
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual([
            'ProfileQueryError',
            'ProfileQueryError',
            'ProfileQueryError',
        ])
    })
})

const INPUT: ProfileInput = {
    displayName: 'Ana',
    timezone: 'Europe/Madrid',
    maxHr: null,
    restingHr: 50,
    hyroxDivision: null,
    weeklyHoursCap: 7.5,
    notes: null,
}

describe('upsertProfile', () => {
    it('upserts on user_id with snake_case columns and nulls preserved', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())

        await Effect.runPromise(upsertProfile(supabase, 'user-1', INPUT))

        expect(calls[0]?.op).toBe('upsert')
        expect(calls[0]?.options).toEqual({ onConflict: 'user_id' })
        expect(calls[0]?.payload).toEqual({
            user_id: 'user-1',
            display_name: 'Ana',
            timezone: 'Europe/Madrid',
            max_hr: null,
            resting_hr: 50,
            hyrox_division: null,
            weekly_hours_cap: 7.5,
            notes: null,
        })
    })

    it('fails with ProfileQueryError on a returned error', async () => {
        const { supabase } = makeFakeAdminDb(() => ({
            error: { code: '42501', message: 'denied' },
        }))

        const exit = await Effect.runPromiseExit(upsertProfile(supabase, 'user-1', INPUT))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })

    it('fails with ProfileQueryError when the query rejects', async () => {
        const { supabase } = makeFakeAdminDb(() => new Error('down'))

        const exit = await Effect.runPromiseExit(upsertProfile(supabase, 'user-1', INPUT))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })
})
