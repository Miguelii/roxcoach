import { describe, expect, it, vi } from 'vitest'
import { runRaceAction } from '@/modules/races/run-race-action'

const setup = (action: () => Promise<string>) => {
    const fakes = { ok: vi.fn(), fail: vi.fn(), changed: vi.fn() }
    const run = () =>
        runRaceAction({
            action,
            success: 'Race added',
            failure: 'Could not add the race. Try again.',
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
})
