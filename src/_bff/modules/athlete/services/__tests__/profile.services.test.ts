// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect, Exit, Cause, Option } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { getProfile } from '@/_bff/modules/athlete/services/get-profile.service'
import { updateProfile } from '@/_bff/modules/athlete/services/update-profile.service'
import type { ProfileInput } from '@/_bff/modules/athlete/types'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'

const { createDBServerClientMock } = vi.hoisted(() => ({ createDBServerClientMock: vi.fn() }))

vi.mock('@/_bff/core/db', () => ({ createDBServerClient: createDBServerClientMock }))

// SAFETY: the services only read `user.id`.
const USER = { id: 'user-1' } as User

const INPUT: ProfileInput = {
    displayName: '  Ana ',
    timezone: 'Europe/Madrid',
    maxHr: 190,
    restingHr: 50,
    hyroxDivision: 'open_women',
    weeklyHoursCap: 8,
    notes: null,
}

describe('getProfile', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('returns the defaults when there is no row', async () => {
        const { supabase } = makeFakeAdminDb(() => ok(null))
        createDBServerClientMock.mockResolvedValue(supabase)

        const profile = await Effect.runPromise(getProfile(USER))

        expect(profile).toEqual({
            displayName: '',
            timezone: 'Europe/Lisbon',
            maxHr: null,
            restingHr: null,
            hyroxDivision: null,
            weeklyHoursCap: null,
            notes: null,
        })
    })

    it('fails with CreateSbClientError when the client cannot be created', async () => {
        createDBServerClientMock.mockRejectedValue(new Error('no cookies'))

        const exit = await Effect.runPromiseExit(getProfile(USER))

        expect(failureTag(exit)).toBe('CreateSbClientError')
    })
})

describe('updateProfile', () => {
    beforeEach(() => {
        createDBServerClientMock.mockReset()
    })

    it('rejects invalid input with the failing field and writes nothing', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())
        createDBServerClientMock.mockResolvedValue(supabase)

        const exit = await Effect.runPromiseExit(updateProfile(USER, { ...INPUT, maxHr: 100 }))

        expect(failureTag(exit)).toBe('ProfileValidationError')
        const failure = Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : Option.none()
        // SAFETY: the failure is a ProfileValidationError, which carries `field`.
        expect(Option.isSome(failure) && (failure.value as { field: string }).field).toBe('maxHr')
        expect(calls).toHaveLength(0)
    })

    it('writes then returns the saved profile', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())
        createDBServerClientMock.mockResolvedValue(supabase)

        const saved = await Effect.runPromise(updateProfile(USER, INPUT))

        expect(saved).toEqual({ ...INPUT, displayName: 'Ana' })
        expect(calls).toHaveLength(1)
        expect(calls[0]?.op).toBe('upsert')
        expect(calls[0]?.payload).toMatchObject({ user_id: 'user-1', display_name: 'Ana' })
    })

    it('stores an empty notes string as null', async () => {
        const { calls, supabase } = makeFakeAdminDb(() => ok())
        createDBServerClientMock.mockResolvedValue(supabase)

        const saved = await Effect.runPromise(updateProfile(USER, { ...INPUT, notes: '' }))

        expect(saved.notes).toBeNull()
        expect(calls[0]?.payload).toMatchObject({ notes: null })
    })

    it('fails with ProfileQueryError when the write fails', async () => {
        const { supabase } = makeFakeAdminDb(() => new Error('down'))
        createDBServerClientMock.mockResolvedValue(supabase)

        const exit = await Effect.runPromiseExit(updateProfile(USER, INPUT))

        expect(failureTag(exit)).toBe('ProfileQueryError')
    })
})
