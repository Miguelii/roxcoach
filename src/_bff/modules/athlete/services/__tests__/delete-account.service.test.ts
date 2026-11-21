import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { Logger } from '@/_bff/lib/server-logger'
import {
    deleteAccount,
    type DeleteAccountDeps,
} from '@/_bff/modules/athlete/services/delete-account.service'

vi.mock('@/_bff/lib/server-logger', () => ({ Logger: vi.fn() }))

// SAFETY: the test only needs the id of the user.
const USER = { id: 'user-1' } as User

const list = vi.fn()
const remove = vi.fn()
const deleteUser = vi.fn()
const signOut = vi.fn()
const createAdminClient = vi.fn()
const createServerClient = vi.fn()

// SAFETY: the fakes implement only the client methods the service calls.
const deps: DeleteAccountDeps = {
    createAdminClient: createAdminClient as never,
    createServerClient: createServerClient as never,
}

const run = () => Effect.runPromiseExit(deleteAccount(USER, deps))

describe('deleteAccount', () => {
    beforeEach(() => {
        list.mockReset().mockResolvedValue({ data: [], error: null })
        remove.mockReset().mockResolvedValue({ error: null })
        deleteUser.mockReset().mockResolvedValue({ error: null })
        signOut.mockReset().mockResolvedValue({ error: null })
        const from = vi.fn().mockReturnValue({ list, remove })
        createAdminClient
            .mockReset()
            .mockReturnValue({ storage: { from }, auth: { admin: { deleteUser } } })
        createServerClient.mockReset().mockResolvedValue({ auth: { signOut } })
        vi.mocked(Logger).mockClear()
    })

    it('removes the files, deletes the auth user and signs out', async () => {
        const exit = await run()

        expect(failureTag(exit)).toBeNull()
        expect(deleteUser).toHaveBeenCalledWith('user-1')
        expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    })

    it('removes every page of files under the user folder, then deletes the user', async () => {
        list.mockResolvedValueOnce({ data: [{ name: 'a.fit' }, { name: 'b.tcx' }], error: null })
            .mockResolvedValueOnce({ data: [{ name: 'c.gpx' }], error: null })
            .mockResolvedValue({ data: [], error: null })

        await run()

        expect(list).toHaveBeenCalledWith('user-1', { limit: 1000 })
        expect(remove).toHaveBeenNthCalledWith(1, ['user-1/a.fit', 'user-1/b.tcx'])
        expect(remove).toHaveBeenNthCalledWith(2, ['user-1/c.gpx'])
        expect(remove.mock.invocationCallOrder.at(-1)).toBeLessThan(
            deleteUser.mock.invocationCallOrder[0]
        )
    })

    it.each([
        ['returns an error', () => list.mockResolvedValue({ data: null, error: { message: 'x' } })],
        ['throws', () => list.mockRejectedValue(new Error('network'))],
    ])('stops before deleting the user when listing the files %s', async (_name, arrange) => {
        arrange()

        const exit = await run()

        expect(failureTag(exit)).toBe('AccountDeletionError')
        expect(deleteUser).not.toHaveBeenCalled()
        expect(signOut).not.toHaveBeenCalled()
    })

    it('stops before deleting the user when removing the files fails', async () => {
        list.mockResolvedValue({ data: [{ name: 'a.fit' }], error: null })
        remove.mockResolvedValue({ error: { message: 'denied' } })

        const exit = await run()

        expect(failureTag(exit)).toBe('AccountDeletionError')
        expect(deleteUser).not.toHaveBeenCalled()
    })

    it.each([
        ['returns an error', () => deleteUser.mockResolvedValue({ error: { message: 'boom' } })],
        ['throws', () => deleteUser.mockRejectedValue(new Error('network'))],
    ])('fails and does not sign out when deleting the user %s', async (_name, arrange) => {
        arrange()

        const exit = await run()

        expect(failureTag(exit)).toBe('AccountDeletionError')
        expect(signOut).not.toHaveBeenCalled()
    })

    it('still succeeds and logs when the sign-out fails', async () => {
        signOut.mockResolvedValue({ error: { message: 'cannot sign out' } })

        const exit = await run()

        expect(failureTag(exit)).toBeNull()
        expect(Logger).toHaveBeenCalledTimes(1)
    })

    it('fails with CreateSbClientError when the admin client cannot be created', async () => {
        createAdminClient.mockImplementation(() => {
            throw new Error('no env')
        })

        expect(failureTag(await run())).toBe('CreateSbClientError')
    })
})
