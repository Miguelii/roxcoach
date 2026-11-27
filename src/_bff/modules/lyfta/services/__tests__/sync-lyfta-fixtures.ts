import { vi } from 'vitest'
import { DEFAULT_RUN_TYPE_RULES } from '@/_bff/core/constants/weekly-goals.constants'
import { Effect, Exit } from 'effect'
import { makeFakeAdminDb, ok } from '@/_bff/lib/fake-admin-db'
import { failureTag } from '@/_bff/lib/tests-utils'
import { syncLyftaWorkouts } from '@/_bff/modules/lyfta/services/sync-lyfta-workouts.service'
import { encryptLyftaApiKey } from '@/_bff/modules/lyfta/utils/credentials.utils'

export const USER_ID = 'user-sync-1'
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
const ENCRYPTED_API_KEY = encryptLyftaApiKey('test-lyfta-key', ENCRYPTION_KEY)
export const START = new Date('2026-11-20T08:30:00.000Z')
// The run's lease as the task payload carries it and as the database returns it.
export const RUN_STARTED_AT = '2026-11-20T08:29:59.000Z'
const DB_STARTED_AT = '2026-11-20T08:29:59+00:00'
// The windows of a first sync started at START (360 days back, 90 day windows, bounds inclusive).
export const FIRST_FROM = '2025-11-25'
export const WINDOW_ENDS = ['2026-02-22', '2026-05-23', '2026-08-21', '2026-11-19', '2026-11-20']

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type Fetch = typeof fetch
type SyncExit = Awaited<ReturnType<ReturnType<typeof setup>['run']>>
type Payload = { last_synced_at?: string }
type Lease = { status: string; startedAt: string | null }
type ConnectionOptions = {
    lastSyncedAt?: string | null
    readsBeforeGone?: number
    leaseAfterReads?: Lease & { reads: number }
    checkpointMatchesNothing?: boolean
}

// The value of a successful sync; a failure fails the test with its tag.
export const succeeded = (exit: SyncExit) => {
    if (!Exit.isSuccess(exit)) throw new Error(`Sync failed: ${failureTag(exit)}`)
    return exit.value
}

export const workout = (id: number): JsonValue => ({
    id,
    title: `Workout ${id}`,
    workout_perform_date: '2026-08-20T17:05:00.000Z',
    exercises: [],
})

export const page = (currentPage: number, totalPages: number, workouts: JsonValue[]) =>
    new Response(
        JSON.stringify({
            status: true,
            total_pages: totalPages,
            current_page: currentPage,
            workouts,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
    )

export const paramOf = (input: Parameters<Fetch>[0], name: string) =>
    new URL(String(input)).searchParams.get(name)

// A stateful fake of the connection row: checkpoint and every write, like the database. The row
// can disappear after a number of reads (a disconnect during the run), or its lease can change
// (a replaced key resets it to idle, a newer run takes it over). The checkpoint update only matches
// while the lease is still this run's, like the guarded update.
const makeConnection = (initial: ConnectionOptions) => {
    const state = {
        lastSyncedAt: initial.lastSyncedAt ?? null,
        checkpoints: Array.of<string>(),
        reads: 0,
        unexpectedWrites: Array.of<unknown>(),
    }
    const gone = () =>
        initial.readsBeforeGone !== undefined && state.reads > initial.readsBeforeGone
    const lease = () =>
        initial.leaseAfterReads !== undefined && state.reads > initial.leaseAfterReads.reads
            ? initial.leaseAfterReads
            : { status: 'running', startedAt: DB_STARTED_AT }
    const db = makeFakeAdminDb((call) => {
        if (call.op === 'select') {
            state.reads += 1
            if (gone()) return ok(null)
            return ok({
                encrypted_api_key: ENCRYPTED_API_KEY,
                last_synced_at: state.lastSyncedAt,
                sync_status: lease().status,
                sync_started_at: lease().startedAt,
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
        const filterOf = (column: string) => call.filters.find(([name]) => name === column)?.[1]
        const current = lease()
        const matches =
            filterOf('sync_status') === current.status &&
            current.status === 'running' &&
            current.startedAt !== null &&
            Date.parse(String(filterOf('sync_started_at'))) === Date.parse(current.startedAt)
        if (gone() || !matches || initial.checkpointMatchesNothing) return ok(null)
        state.lastSyncedAt = payload.last_synced_at
        state.checkpoints.push(payload.last_synced_at)
        return ok({ user_id: USER_ID })
    })
    return { state, db }
}

export const setup = (options: ConnectionOptions & { fetcher?: Fetch } = {}) => {
    const connection = makeConnection(options)
    const importWorkouts = vi.fn((_userId: string, workouts: unknown[]) =>
        Effect.succeed({ created: workouts.length, updated: 0 })
    )
    const createImportContext = vi.fn(() =>
        Effect.succeed({
            supabase: connection.db.supabase,
            timeZone: 'UTC',
            runTypeRules: DEFAULT_RUN_TYPE_RULES,
        })
    )
    const fetcher: Fetch =
        options.fetcher ?? (async (input) => page(Number(paramOf(input, 'page')), 1, []))
    const dependencies = {
        createAdminClient: () => connection.db.supabase,
        encryptionKey: ENCRYPTION_KEY,
        fetcher,
        importWorkouts,
        createImportContext,
        now: () => START,
    }
    const run = () =>
        Effect.runPromiseExit(syncLyftaWorkouts(USER_ID, RUN_STARTED_AT, dependencies))
    return { ...connection, run, importWorkouts, createImportContext, dependencies }
}

// A fetcher whose window starting at `from` reports `totalPages` pages of one workout each; every
// other window is a single empty page.
export const longWindow =
    (from: string, totalPages: number, pages: number[] = []): Fetch =>
    async (input) => {
        const number = Number(paramOf(input, 'page'))
        if (paramOf(input, 'from') !== from) return page(number, 1, [])
        pages.push(number)
        return page(number, totalPages, [workout(number)])
    }
