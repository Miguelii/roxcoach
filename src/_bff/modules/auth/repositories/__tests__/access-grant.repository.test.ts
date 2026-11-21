import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { grantAccess } from '@/_bff/modules/auth/repositories/access-grant.repository'

type Client = Parameters<typeof grantAccess>[0]

// SAFETY: the test only exercises `rpc`, the one client method the repository uses.
const clientWith = (rpc: ReturnType<typeof vi.fn>): Client => ({ rpc }) as never

describe('grantAccess', () => {
    it('calls the grant function with the user id and the display name', async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null })

        await Effect.runPromise(grantAccess(clientWith(rpc), 'user-1', 'Ana'))

        expect(rpc).toHaveBeenCalledWith('grant_access', {
            p_user_id: 'user-1',
            p_display_name: 'Ana',
        })
    })

    it('fails with GrantAccessError on a returned error', async () => {
        const rpc = vi.fn().mockResolvedValue({ error: { code: 'P0001', message: 'no user' } })

        const exit = await Effect.runPromiseExit(grantAccess(clientWith(rpc), 'user-1', 'Ana'))

        expect(failureTag(exit)).toBe('GrantAccessError')
    })

    it('fails with GrantAccessError when the request throws', async () => {
        const rpc = vi.fn().mockRejectedValue(new Error('network'))

        const exit = await Effect.runPromiseExit(grantAccess(clientWith(rpc), 'user-1', 'Ana'))

        expect(failureTag(exit)).toBe('GrantAccessError')
    })
})
