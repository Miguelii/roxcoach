// @vitest-environment node
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it, vi } from 'vitest'
import { Effect, Exit } from 'effect'
import type { User } from '@supabase/supabase-js'
import { makeFakeAdminDb, ok, type Call } from '@/_bff/lib/fake-admin-db'
import { failureTag } from '@/_bff/lib/tests-utils'
import { SYNC_LEASE_STALE_MS } from '@/_bff/modules/lyfta/constants'
import { syncLyftaWorkouts } from '@/_bff/modules/lyfta/services/sync-lyfta-workouts.service'
import { encryptLyftaApiKey } from '@/_bff/modules/lyfta/utils/credentials.utils'

// SAFETY: These services only read the authenticated user's ID.
const USER = { id: 'user-sync-1' } as User
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
const ENCRYPTED_API_KEY = encryptLyftaApiKey('test-lyfta-key', ENCRYPTION_KEY)
const START = new Date('2026-11-20T08:30:00.000Z')
// The windows of a first sync started at START (360 days back, 90 day windows, bounds inclusive).
const FIRST_FROM = '2025-11-25'
const WINDOW_ENDS = ['2026-02-22', '2026-05-23', '2026-08-21', '2026-11-19', '2026-11-20']

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type Fetch = typeof fetch
type SyncExit = Awaited<ReturnType<ReturnType<typeof setup>['run']>>
type RunHolder = { run: (() => Promise<SyncExit>) | null }
type Payload = { sync_started_at?: string | null; last_synced_at?: string }

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

// A stateful fake of the connection row: lease, checkpoint and every write, like the database.
const makeConnection = (initial: { lastSyncedAt?: string | null; lease?: string | null } = {}) => {
    const state = {
        lease: initial.lease ?? null,
        lastSyncedAt: initial.lastSyncedAt ?? null,
        checkpoints: Array.of<string>(),
        exists: true,
    }
    const filter = (call: Call, column: string) =>
        call.filters.find(([name]) => name === column)?.[1]
    const db = makeFakeAdminDb((call) => {
        if (!state.exists) return ok(null)
        // SAFETY: the repository only writes these two columns.
        const payload = call.payload as Payload | undefined
        if (call.op === 'select')
            return ok({ encrypted_api_key: ENCRYPTED_API_KEY, last_synced_at: state.lastSyncedAt })
        if (payload?.sync_started_at) {
            const stale = String(filter(call, 'or')).split('sync_started_at.lt.')[1] ?? ''
            if (state.lease !== null && state.lease >= stale) return ok(null)
            state.lease = payload.sync_started_at
            return ok({ user_id: USER.id })
        }
        if (payload && 'sync_started_at' in payload && payload.sync_started_at === null) {
            if (filter(call, 'sync_started_at') === state.lease) state.lease = null
            return ok()
        }
        if (payload?.last_synced_at) {
            state.lastSyncedAt = payload.last_synced_at
            state.checkpoints.push(payload.last_synced_at)
        }
        return ok({ user_id: USER.id })
    })
    return { state, db }
}

const setup = (
    options: {
        lastSyncedAt?: string | null
        lease?: string | null
        fetcher?: Fetch
        importMs?: number
    } = {}
) => {
    const connection = makeConnection(options)
    const clock = { now: START.getTime() }
    const importWorkout = vi.fn(() => {
        clock.now += options.importMs ?? 0
        return Effect.succeed({ activityId: 'activity', created: true })
    })
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
        now: () => new Date(clock.now),
    }
    const run = () => Effect.runPromiseExit(syncLyftaWorkouts(USER, dependencies))
    return { ...connection, run, importWorkout, createImportContext, clock, dependencies }
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
        expect(state.lease).toBeNull()
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

    it('stops starting new workouts after the time budget, keeps the checkpoint and reports hasMore', async () => {
        const fetcher: Fetch = async (input) =>
            page(
                1,
                1,
                paramOf(input, 'from') === FIRST_FROM ? [workout(1), workout(2), workout(3)] : []
            )
        const { run, state, importWorkout } = setup({ fetcher, importMs: 30_000 })

        const exit = await run()

        // 30 s after the first, 60 s after the second: the third is never started.
        expect(importWorkout).toHaveBeenCalledTimes(2)
        expect(state.checkpoints).toEqual([])
        expect(state.lease).toBeNull()
        expect(succeeded(exit)).toEqual({
            created: 2,
            updated: 0,
            hasMore: true,
            lastSyncedAt: null,
        })
    })

    it('a capped run checkpoints only the last completed window and the next run resumes from it', async () => {
        const slowFrom = '2026-05-24'
        const first = setup({
            importMs: 41_000,
            fetcher: async (input) =>
                page(1, 1, paramOf(input, 'from') === slowFrom ? [workout(1), workout(2)] : []),
        })

        const firstExit = await first.run()

        expect(first.state.checkpoints).toEqual([
            '2026-02-22T00:00:00.000Z',
            '2026-05-23T00:00:00.000Z',
        ])
        expect(first.importWorkout).toHaveBeenCalledTimes(1)
        expect(succeeded(firstExit).hasMore).toBe(true)
        expect(succeeded(firstExit).lastSyncedAt).toBe('2026-05-23T00:00:00.000Z')

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
        expect(state.lease).toBeNull()
    })

    it('stops at the page ceiling of 20 pages and leaves the window unfinished', async () => {
        const pages: number[] = []
        const { run, state, importWorkout } = setup({
            fetcher: async (input) => {
                const number = Number(paramOf(input, 'page'))
                pages.push(number)
                return page(number, 25, [workout(number)])
            },
        })

        const exit = await run()

        expect(pages).toHaveLength(20)
        expect(importWorkout).toHaveBeenCalledTimes(20)
        expect(state.checkpoints).toEqual([])
        expect(succeeded(exit).hasMore).toBe(true)
    })

    it('refuses an overlapping sync, and the first one still finishes and releases the lease', async () => {
        let secondExit: SyncExit | null = null
        let started = false
        const holder: RunHolder = { run: null }
        const { run, state } = setup({
            fetcher: async (input) => {
                if (!started) {
                    started = true
                    secondExit = (await holder.run?.()) ?? null
                }
                return page(Number(paramOf(input, 'page')), 1, [])
            },
        })
        holder.run = run

        const firstExit = await run()

        expect(failureTag(secondExit!)).toBe('LyftaSyncInProgressError')
        expect(Exit.isSuccess(firstExit)).toBe(true)
        expect(state.lease).toBeNull()
    })

    it('takes a stale lease older than 5 minutes but refuses a fresher one', async () => {
        const stale = new Date(START.getTime() - SYNC_LEASE_STALE_MS - 1000).toISOString()
        const fresh = new Date(START.getTime() - SYNC_LEASE_STALE_MS + 60_000).toISOString()

        const taken = await setup({ lease: stale }).run()
        const refused = setup({ lease: fresh })
        const refusedExit = await refused.run()

        expect(Exit.isSuccess(taken)).toBe(true)
        expect(failureTag(refusedExit)).toBe('LyftaSyncInProgressError')
        expect(refused.state.lease).toBe(fresh)
    })

    it('fails without requesting Lyfta when there is no connection', async () => {
        const fetcher = vi.fn<Fetch>()
        const dependencies = {
            ...setup({ fetcher }).dependencies,
            createAdminClient: () => makeFakeAdminDb(() => ok(null)).supabase,
        }

        const exit = await Effect.runPromiseExit(syncLyftaWorkouts(USER, dependencies))

        expect(failureTag(exit)).toBe('LyftaConnectionNotFoundError')
        expect(fetcher).not.toHaveBeenCalled()
    })
})
