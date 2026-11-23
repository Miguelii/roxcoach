// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    getAthleteTimezone,
    getAthleteTimezoneWithClient,
} from '@/_bff/modules/athlete/services/get-athlete-timezone.service'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

// SAFETY: the service only reads `user.id`.
const USER = { id: 'user-1' } as User

describe('getAthleteTimezone', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('reads the timezone as the signed-in user', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok({ timezone: 'Europe/Madrid' }))
        createDBServerClientMock.mockResolvedValue(supabase)

        const timezone = await Effect.runPromise(getAthleteTimezone(USER))

        expect(timezone).toBe('Europe/Madrid')
        expect(calls[0]?.filters).toEqual([['user_id', 'user-1']])
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no cookies'))

        const exit = await Effect.runPromiseExit(getAthleteTimezone(USER))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })

    it('fails with ProfileQueryError when the read fails', async () => {
        const { supabase } = makeFakeAdminDb(() => new Error('boom'))
        createDBServerClientMock.mockResolvedValue(supabase)

        const exit = await Effect.runPromiseExit(getAthleteTimezone(USER))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })
})

describe('getAthleteTimezoneWithClient', () => {
    it('reads the timezone of the user ID with the given client', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok({ timezone: 'Europe/Madrid' }))

        const timezone = await Effect.runPromise(getAthleteTimezoneWithClient(supabase, 'user-9'))

        expect(timezone).toBe('Europe/Madrid')
        expect(calls[0]?.filters).toEqual([['user_id', 'user-9']])
    })
})
