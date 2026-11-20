import { describe, expect, it, vi } from 'vitest'
import { TRPCClientError } from '@trpc/client'
import { runRaceAction } from '@/modules/races/run-race-action'

const trpcError = (code: string) =>
    TRPCClientError.from({
        error: { message: 'server detail', code: -32600, data: { code, httpStatus: 400 } },
    })

const setup = (action: () => Promise<string>, badRequest?: string) => {
    const fakes = { ok: vi.fn(), fail: vi.fn(), changed: vi.fn() }
    const run = () =>
        runRaceAction({
            action,
            success: 'Race added',
            failure: 'Could not add the race. Try again.',
            badRequest,
            notifySuccess: fakes.ok,
            notifyFailure: fakes.fail,
            onChanged: fakes.changed,
        })
    return { fakes, run }
}

describe('runRaceAction', () => {
    it('toasts and calls the injected change callback (calendar invalidation) after success', async () => {
        const { fakes, run } = setup(() => Promise.resolve('done'))

        await run()

        expect(fakes.ok).toHaveBeenCalledWith('Race added')
        expect(fakes.changed).toHaveBeenCalledTimes(1)
        expect(fakes.fail).not.toHaveBeenCalled()
    })

    it('notifies the failure, rethrows and does not call the change callback', async () => {
        const { fakes, run } = setup(() => Promise.reject(new Error('boom')))

        await expect(run()).rejects.toThrow('boom')

        expect(fakes.fail).toHaveBeenCalledWith('Could not add the race. Try again.')
        expect(fakes.changed).not.toHaveBeenCalled()
        expect(fakes.ok).not.toHaveBeenCalled()
    })

    it('uses the bad request copy only for a BAD_REQUEST code and never the server text', async () => {
        const badRequest = trpcError('BAD_REQUEST')
        const first = setup(
            () => Promise.reject(badRequest),
            'Check the race details and try again'
        )
        await expect(first.run()).rejects.toThrow()
        expect(first.fakes.fail).toHaveBeenCalledWith('Check the race details and try again')

        const server = trpcError('INTERNAL_SERVER_ERROR')
        const second = setup(() => Promise.reject(server), 'Check the race details and try again')
        await expect(second.run()).rejects.toThrow()
        expect(second.fakes.fail).toHaveBeenCalledWith('Could not add the race. Try again.')
    })
})
