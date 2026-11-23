// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Exit } from 'effect'
import {
    history,
    NEWEST_RUN_S,
    run,
    RUN_STARTED_AT,
    setup,
    USER_ID,
} from '@/_bff/modules/zepp/services/__tests__/sync-zepp-fixtures'

describe('syncZeppActivities lease ownership', () => {
    it('stops quietly at the 25th detail when the key was replaced, without a checkpoint', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(NEWEST_RUN_S - 100 + index))
        const { checkpoints, importedTrackIds, selects, sync } = setup({
            historyBody: history(runs),
            leaseAtRead: { read: 2, status: 'idle', startedAt: null },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value.imported).toBe(25)
        expect(importedTrackIds).toHaveLength(25)
        expect(selects()).toBe(2)
        expect(checkpoints()).toHaveLength(0)
    })

    it('stops quietly at the 25th detail when a newer run took over the lease', async () => {
        const runs = Array.from({ length: 60 }, (_, index) => run(NEWEST_RUN_S - 100 + index))
        const { checkpoints, importedTrackIds, sync } = setup({
            historyBody: history(runs),
            leaseAtRead: { read: 2, status: 'running', startedAt: '2026-11-21T10:20:00+00:00' },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(importedTrackIds).toHaveLength(25)
        expect(checkpoints()).toHaveLength(0)
    })

    it('does not fetch anything when the lease is already gone at the start', async () => {
        const { checkpoints, fetcher, sync } = setup({
            leaseAtRead: { read: 1, status: 'idle', startedAt: null },
        })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 0,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
        expect(fetcher).not.toHaveBeenCalled()
        expect(checkpoints()).toHaveLength(0)
    })

    it("only moves the checkpoint while the lease is still this run's", async () => {
        const { checkpoints, sync } = setup()

        await sync()

        expect(checkpoints()[0]?.filters).toEqual(
            expect.arrayContaining([
                ['user_id', USER_ID],
                ['sync_started_at', RUN_STARTED_AT],
                ['sync_status', 'running'],
            ])
        )
    })

    it('ends quietly without failing when the checkpoint update matches no row', async () => {
        const { sync } = setup({ checkpointMatchesNothing: true })

        const exit = await sync()

        expect(Exit.isSuccess(exit) && exit.value).toEqual({
            imported: 1,
            skipped: 0,
            updated: 0,
            remaining: 0,
        })
    })
})
