// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { failureTag } from '@/_bff/lib/tests-utils'
import { syncLyftaWorkouts } from '@/_bff/modules/lyfta/services/sync-lyfta-workouts.service'
import {
    type Fetch,
    FIRST_FROM,
    longWindow,
    page,
    paramOf,
    RUN_STARTED_AT,
    setup,
    START,
    succeeded,
    USER_ID,
    WINDOW_ENDS,
    workout,
} from '@/_bff/modules/lyfta/services/__tests__/sync-lyfta-fixtures'

describe('syncLyftaWorkouts', () => {
    it('first sync reads the last 360 days in ascending 90 day windows and ends at now', async () => {
        const windows: Array<[string | null, string | null]> = []
        const fetcher: Fetch = async (input) => {
            windows.push([paramOf(input, 'from'), paramOf(input, 'to')])
            return page(1, 1, windows.length === 1 ? [workout(1), workout(2)] : [])
        }
        const { run, state, importWorkout } = setup({ fetcher })

        const exit = await run()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(windows[0]).toEqual([FIRST_FROM, WINDOW_ENDS[0]])
        expect(windows.map(([, to]) => to)).toEqual(WINDOW_ENDS)
        expect(windows[1]?.[0]).toBe('2026-02-23')
        expect(importWorkout).toHaveBeenCalledTimes(2)
        expect(state.checkpoints).toEqual([
            '2026-02-22T00:00:00.000Z',
            '2026-05-23T00:00:00.000Z',
            '2026-08-21T00:00:00.000Z',
            '2026-11-19T00:00:00.000Z',
            START.toISOString(),
        ])
        expect(state.unexpectedWrites).toEqual([])
        expect(succeeded(exit)).toEqual({
            created: 2,
            updated: 0,
            hasMore: false,
            lastSyncedAt: START.toISOString(),
        })
    })

    it('resolves the timezone and the client once per sync, not per workout or window', async () => {
        const fetcher: Fetch = async (input) =>
            page(1, 1, paramOf(input, 'from') === FIRST_FROM ? [workout(1), workout(2)] : [])
        const { run, createImportContext } = setup({ fetcher })

        await run()

        expect(createImportContext).toHaveBeenCalledTimes(1)
    })

    it('does not advance past the last completed window when a later window fails', async () => {
        let call = 0
        const { run, state } = setup({
            fetcher: async (input) => {
                call += 1
                return call === 1
                    ? page(Number(paramOf(input, 'page')), 1, [])
                    : new Response('x', { status: 503 })
            },
        })

        const exit = await run()

        expect(failureTag(exit)).toBe('LyftaApiError')
        expect(state.checkpoints).toEqual(['2026-02-22T00:00:00.000Z'])
        expect(state.unexpectedWrites).toEqual([])
    })

    it('completes a history of 25 pages in one run', async () => {
        const pages: number[] = []
        const { run, state, importWorkout } = setup({ fetcher: longWindow(FIRST_FROM, 25, pages) })

        const exit = await run()

        expect(pages).toHaveLength(25)
        expect(importWorkout).toHaveBeenCalledTimes(25)
        expect(state.checkpoints).toHaveLength(WINDOW_ENDS.length)
        expect(succeeded(exit)).toMatchObject({ created: 25, hasMore: false })
    })

    it('stops at the safety ceiling of 200 pages, checkpoints the completed windows and resumes', async () => {
        const slowFrom = '2026-05-24'
        const pages: number[] = []
        const first = setup({ fetcher: longWindow(slowFrom, 250, pages) })

        const firstExit = await first.run()

        // Two one-page windows came first, so the third window gets the remaining 198 pages.
        expect(pages).toHaveLength(198)
        expect(first.state.checkpoints).toEqual([
            '2026-02-22T00:00:00.000Z',
            '2026-05-23T00:00:00.000Z',
        ])
        expect(succeeded(firstExit)).toMatchObject({
            created: 198,
            hasMore: true,
            lastSyncedAt: '2026-05-23T00:00:00.000Z',
        })

        const starts: Array<string | null> = []
        const second = setup({
            lastSyncedAt: first.state.lastSyncedAt,
            fetcher: async (input) => {
                starts.push(paramOf(input, 'from'))
                return page(1, 1, [])
            },
        })
        const secondExit = await second.run()

        // The checkpoint day minus the one-day overlap.
        expect(starts[0]).toBe('2026-05-22')
        expect(succeeded(secondExit).hasMore).toBe(false)
    })

    it('stops quietly after the current window when the connection disappears', async () => {
        const windows: Array<string | null> = []
        const { run, state } = setup({
            readsBeforeGone: 2,
            fetcher: async (input) => {
                windows.push(paramOf(input, 'from'))
                return page(1, 1, windows.length === 2 ? [workout(1)] : [])
            },
        })

        const exit = await run()

        // Read 1 starts the run, read 2 precedes window 2, read 3 (before window 3) finds no row.
        expect(windows).toHaveLength(2)
        expect(state.checkpoints).toEqual(['2026-02-22T00:00:00.000Z', '2026-05-23T00:00:00.000Z'])
        expect(state.unexpectedWrites).toEqual([])
        expect(succeeded(exit)).toEqual({
            created: 1,
            updated: 0,
            hasMore: false,
            lastSyncedAt: '2026-05-23T00:00:00.000Z',
        })
    })

    it('fails without requesting Lyfta when there is no connection', async () => {
        const fetcher = vi.fn<Fetch>()
        const dependencies = {
            ...setup({ fetcher }).dependencies,
            createAdminClient: () => makeFakeAdminDb(() => ok(null)).supabase,
        }

        const exit = await Effect.runPromiseExit(
            syncLyftaWorkouts(USER_ID, RUN_STARTED_AT, dependencies)
        )

        expect(failureTag(exit)).toBe('LyftaConnectionNotFoundError')
        expect(fetcher).not.toHaveBeenCalled()
    })
})
