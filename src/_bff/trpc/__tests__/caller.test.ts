// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createCaller } from '@/_bff/trpc/caller'

const { createContextMock } = vi.hoisted(() => ({ createContextMock: vi.fn() }))

vi.mock('@/_bff/trpc/context', () => ({ createContext: createContextMock }))

describe('createCaller', () => {
    it('builds the context and returns a caller exposing the training namespace', async () => {
        createContextMock.mockResolvedValue({})

        const caller = await createCaller()

        expect(createContextMock).toHaveBeenCalledTimes(1)
        expect(caller.training.getCalendar).toBeDefined()
        expect(caller.training.getActivity).toBeDefined()
        expect(caller.athlete.getTimezone).toBeDefined()
        expect(caller.auth.login).toBeDefined()
    })
})
