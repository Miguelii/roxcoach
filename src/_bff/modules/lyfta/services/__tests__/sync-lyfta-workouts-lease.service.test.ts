// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
    type Fetch,
    FIRST_FROM,
    page,
    paramOf,
    RUN_STARTED_AT,
    setup,
    succeeded,
    USER_ID,
    workout,
} from '@/_bff/modules/lyfta/services/__tests__/sync-lyfta-fixtures'

describe('syncLyftaWorkouts lease ownership', () => {
    it("only moves the checkpoint while the lease is still this run's", async () => {
        const { run, db } = setup()

        await run()

        const checkpoint = db.calls.find((call) => call.op === 'update')
        expect(checkpoint?.filters).toEqual(
            expect.arrayContaining([
                ['user_id', USER_ID],
                ['sync_started_at', RUN_STARTED_AT],
                ['sync_status', 'running'],
            ])
        )
    })

    it('stops quietly without another checkpoint when the key is replaced mid-run', async () => {
        const windows: Array<string | null> = []
        const { run, state } = setup({
            leaseAfterReads: { reads: 1, status: 'idle', startedAt: null },
            fetcher: async (input) => {
                windows.push(paramOf(input, 'from'))
                return page(1, 1, [workout(windows.length)])
            },
        })

        const exit = await run()

        // Read 1 starts the run; read 2, before window 2, finds the row reset to idle.
        expect(windows).toEqual([FIRST_FROM])
        expect(state.checkpoints).toEqual(['2026-02-22T00:00:00.000Z'])
        expect(state.unexpectedWrites).toEqual([])
        expect(succeeded(exit)).toEqual({
            created: 1,
            updated: 0,
            hasMore: false,
            lastSyncedAt: '2026-02-22T00:00:00.000Z',
        })
    })

    it('does not import anything when the lease is already gone at the start', async () => {
        const fetcher = vi.fn<Fetch>()
        const { run, state } = setup({
            leaseAfterReads: { reads: 0, status: 'idle', startedAt: null },
            fetcher,
        })

        const exit = await run()

        expect(fetcher).not.toHaveBeenCalled()
        expect(state.checkpoints).toEqual([])
        expect(succeeded(exit)).toEqual({
            created: 0,
            updated: 0,
            hasMore: false,
            lastSyncedAt: null,
        })
    })

    it('stops quietly when a newer run took over the lease', async () => {
        const windows: Array<string | null> = []
        const { run, state } = setup({
            leaseAfterReads: {
                reads: 1,
                status: 'running',
                startedAt: '2026-11-20T08:50:00+00:00',
            },
            fetcher: async (input) => {
                windows.push(paramOf(input, 'from'))
                return page(1, 1, [])
            },
        })

        const exit = await run()

        expect(windows).toEqual([FIRST_FROM])
        expect(state.checkpoints).toEqual(['2026-02-22T00:00:00.000Z'])
        expect(succeeded(exit)).toMatchObject({ hasMore: false })
    })

    it('stops quietly without failing when the checkpoint update matches no row', async () => {
        const windows: Array<string | null> = []
        const { run, state } = setup({
            checkpointMatchesNothing: true,
            fetcher: async (input) => {
                windows.push(paramOf(input, 'from'))
                return page(1, 1, [workout(1)])
            },
        })

        const exit = await run()

        expect(windows).toEqual([FIRST_FROM])
        expect(state.checkpoints).toEqual([])
        expect(succeeded(exit)).toEqual({
            created: 1,
            updated: 0,
            hasMore: false,
            lastSyncedAt: null,
        })
    })
})
