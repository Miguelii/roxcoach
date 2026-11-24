// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { adminProcedure, protectedProcedure, router } from '@/_bff/trpc/server'
import { GetUserError } from '@/_bff/lib/errors'
import { ErrorCode } from '@/_bff/lib/error-codes'

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }))

vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: getSessionMock,
}))

const testRouter = router({
    whoami: protectedProcedure.query(({ ctx }) => ctx.user.id),
    adminWhoami: adminProcedure.query(({ ctx }) => ctx.user.id),
})

const caller = testRouter.createCaller({})

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('protectedProcedure', () => {
    beforeEach(() => {
        getSessionMock.mockReset()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('fails UNAUTHORIZED when there is no session user', async () => {
        getSessionMock.mockReturnValue(Effect.succeed(null))

        const error = await caught(caller.whoami())

        expect(error.code).toBe('UNAUTHORIZED')
    })

    it('fails FORBIDDEN when the user lacks the roxcoach flag', async () => {
        getSessionMock.mockReturnValue(
            Effect.succeed({ id: 'user-1', app_metadata: { brewstock: true } })
        )

        const error = await caught(caller.whoami())

        expect(error.code).toBe('FORBIDDEN')
    })

    it('fails FORBIDDEN when the flag is not the strict boolean true', async () => {
        getSessionMock.mockReturnValue(
            Effect.succeed({ id: 'user-1', app_metadata: { roxcoach: 'true' } })
        )

        const error = await caught(caller.whoami())

        expect(error.code).toBe('FORBIDDEN')
    })

    it('reaches the resolver with ctx.user when the flag is set', async () => {
        getSessionMock.mockReturnValue(
            Effect.succeed({ id: 'user-1', app_metadata: { roxcoach: true } })
        )

        await expect(caller.whoami()).resolves.toBe('user-1')
    })

    it('fails INTERNAL_SERVER_ERROR when getSession fails', async () => {
        getSessionMock.mockReturnValue(
            Effect.fail(
                new GetUserError({ cause: 'down', error_hash: ErrorCode.AUTH_SESSION_GET_USER })
            )
        )

        const error = await caught(caller.whoami())

        expect(error.code).toBe('INTERNAL_SERVER_ERROR')
    })
})

describe('adminProcedure', () => {
    beforeEach(() => {
        getSessionMock.mockReset()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('fails UNAUTHORIZED when there is no session user', async () => {
        getSessionMock.mockReturnValue(Effect.succeed(null))

        const error = await caught(caller.adminWhoami())

        expect(error.code).toBe('UNAUTHORIZED')
    })

    it.each([
        ['without the admin flag', { roxcoach: true }],
        ['with a non-boolean admin flag', { roxcoach: true, roxcoach_admin: 'true' }],
        ['with the admin flag but without access', { roxcoach_admin: true }],
    ])('fails FORBIDDEN %s', async (_label, appMetadata) => {
        getSessionMock.mockReturnValue(Effect.succeed({ id: 'user-1', app_metadata: appMetadata }))

        const error = await caught(caller.adminWhoami())

        expect(error.code).toBe('FORBIDDEN')
    })

    it('reaches the resolver with ctx.user for an admin', async () => {
        getSessionMock.mockReturnValue(
            Effect.succeed({ id: 'user-1', app_metadata: { roxcoach: true, roxcoach_admin: true } })
        )

        await expect(caller.adminWhoami()).resolves.toBe('user-1')
    })
})
