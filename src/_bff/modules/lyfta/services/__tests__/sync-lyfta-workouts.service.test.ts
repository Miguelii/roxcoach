// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { failureTag } from '@/_bff/lib/tests-utils'
import { syncLyftaWorkouts } from '@/_bff/modules/lyfta/services/sync-lyfta-workouts.service'
import { encryptLyftaApiKey } from '@/_bff/modules/lyfta/utils/credentials.utils'

const USER_ID = 'user-sync-1'
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
const ENCRYPTED_API_KEY = encryptLyftaApiKey('test-lyfta-key', ENCRYPTION_KEY)
const START = new Date('2026-11-20T08:30:00.000Z')
// The windows of a first sync started at START (360 days back, 90 day windows, bounds inclusive).
const FIRST_FROM = '2025-11-25'
const WINDOW_ENDS = ['2026-02-22', '2026-05-23', '2026-08-21', '2026-11-19', '2026-11-20']

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type Fetch = typeof fetch
type SyncExit = Awaited<ReturnType<ReturnType<typeof setup>['run']>>
type Payload = { last_synced_at?: string }

// The value of a successful sync; a failure fails the test with its tag.
const succeeded = (exit: SyncExit) => {
    if (!Exit.isSuccess(exit)) throw new Error(`Sync failed: ${failureTag(exit)}`)
    return exit.value
}

const workout = (id: number): JsonValue => ({
    id,
    title: `Workout ${id}`,
    workout_perform_date: '2026-08-20T17:05:00.000Z',
    exercises: [],
})

const page = (currentPage: number, totalPages: number, workouts: JsonValue[]) =>
    new Response(
        JSON.stringify({
            status: true,
            total_pages: totalPages,
            current_page: currentPage,
            workouts,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
    )

const paramOf = (input: Parameters<Fetch>[0], name: string) =>
    new URL(String(input)).searchParams.get(name)

// A stateful fake of the connection row: checkpoint and every write, like the database. The row
// can disappear after a number of reads (a disconnect during the run).
const makeConnection = (initial: { lastSyncedAt?: string | null; readsBeforeGone?: number }) => {
    const state = {
        lastSyncedAt: initial.lastSyncedAt ?? null,
        checkpoints: Array.of<string>(),
        reads: 0,
        unexpectedWrites: Array.of<unknown>(),
    }
    const gone = () =>
        initial.readsBeforeGone !== undefined && state.reads > initial.readsBeforeGone
    const db = makeFakeAdminDb((call) => {
        if (call.op === 'select') {
            state.reads += 1
            if (gone()) return ok(null)
            return ok({
                encrypted_api_key: ENCRYPTED_API_KEY,
                last_synced_at: state.lastSyncedAt,
                sync_status: 'running',
                sync_started_at: START.toISOString(),
                sync_finished_at: null,
                sync_result: null,
                sync_error: null,
            })
        }
        // SAFETY: the sync only writes the checkpoint column.
        const payload = call.payload as Payload | undefined
        if (call.op !== 'update' || !payload?.last_synced_at || Object.keys(payload).length !== 1) {
            state.unexpectedWrites.push(call.payload)
            return ok()
        }
        if (gone()) return ok(null)
        state.lastSyncedAt = payload.last_synced_at
        state.checkpoints.push(payload.last_synced_at)
        return ok({ user_id: USER_ID })
    })
    return { state, db }
}

const setup = (
    options: { lastSyncedAt?: string | null; readsBeforeGone?: number; fetcher?: Fetch } = {}
) => {
    const connection = makeConnection(options)
    const importWorkout = vi.fn(() => Effect.succeed({ activityId: 'activity', created: true }))
    const createImportContext = vi.fn(() =>
        Effect.succeed({ supabase: connection.db.supabase, timeZone: 'UTC' })
    )
    const fetcher: Fetch =
        options.fetcher ?? (async (input) => page(Number(paramOf(input, 'page')), 1, []))
    const dependencies = {
        createAdminClient: () => connection.db.supabase,
        encryptionKey: ENCRYPTION_KEY,
        fetcher,
        importWorkout,
        createImportContext,
        now: () => START,
    }
    const run = () => Effect.runPromiseExit(syncLyftaWorkouts(USER_ID, dependencies))
    return { ...connection, run, importWorkout, createImportContext, dependencies }
}

// A fetcher whose window starting at `from` reports `totalPages` pages of one workout each; every
// other window is a single empty page.
const longWindow =
    (from: string, totalPages: number, pages: number[] = []): Fetch =>
    async (input) => {
        const number = Number(paramOf(input, 'page'))
        if (paramOf(input, 'from') !== from) return page(number, 1, [])
        pages.push(number)
        return page(number, totalPages, [workout(number)])
    }

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

        const exit = await Effect.runPromiseExit(syncLyftaWorkouts(USER_ID, dependencies))

        expect(failureTag(exit)).toBe('LyftaConnectionNotFoundError')
        expect(fetcher).not.toHaveBeenCalled()
    })
})
