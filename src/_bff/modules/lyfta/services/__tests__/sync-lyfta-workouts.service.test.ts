// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { syncLyftaWorkouts } from '@/_bff/modules/lyfta/services/sync-lyfta-workouts.service'
import { importLyftaWorkout } from '@/_bff/modules/training/services/import-lyfta-workout.service'
import type { LyftaWorkout } from '@/_bff/modules/lyfta/types'
import { encryptLyftaApiKey } from '@/_bff/modules/lyfta/utils/credentials.utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'

// SAFETY: These services only read the authenticated user's ID.
const USER = { id: 'user-sync-1' } as User
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
const ENCRYPTED_API_KEY = encryptLyftaApiKey('test-lyfta-key', ENCRYPTION_KEY)
const WORKOUT = {
    id: 1001,
    title: 'Upper Strength',
    workout_perform_date: '2026-08-20T17:05:00.000Z',
    exercises: [],
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const page = (currentPage: number, totalPages: number, workouts: JsonValue[]) => ({
    status: true,
    total_pages: totalPages,
    current_page: currentPage,
    workouts,
})

const response = (body: JsonValue, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })

const database = (lastSyncedAt: string | null, updateResult = ok({ user_id: USER.id })) =>
    makeFakeDb([
        ok({ encrypted_api_key: ENCRYPTED_API_KEY, last_synced_at: lastSyncedAt }),
        updateResult,
    ])

const dependencies = (
    supabase: ReturnType<typeof makeFakeDb>['supabase'],
    fetcher: typeof fetch,
    importWorkout: typeof importLyftaWorkout,
    now: () => Date
) => ({
    createAdminClient: () => supabase,
    encryptionKey: ENCRYPTION_KEY,
    fetcher,
    importWorkout,
    now,
})

describe('syncLyftaWorkouts', () => {
    it('fetches all pages sequentially, imports them and advances the checkpoint at the end', async () => {
        const { chains, supabase } = database(null)
        const calls: string[] = []
        const fetcher: typeof fetch = async (input) => {
            const url = new URL(String(input))
            calls.push(url.searchParams.get('page') ?? '')
            const pageNumber = Number(url.searchParams.get('page'))
            return response(
                page(
                    pageNumber,
                    2,
                    pageNumber === 1
                        ? [WORKOUT]
                        : [{ ...WORKOUT, id: 1002, title: 'Lower Strength' }]
                )
            )
        }
        const importWorkout = vi
            .fn<
                (
                    user: User,
                    workout: LyftaWorkout
                ) => Effect.Effect<{
                    activityId: string
                    created: boolean
                }>
            >()
            .mockReturnValueOnce(Effect.succeed({ activityId: 'activity-1', created: true }))
            .mockReturnValueOnce(Effect.succeed({ activityId: 'activity-2', created: false }))
        const now = vi
            .fn<() => Date>()
            .mockReturnValueOnce(new Date('2026-11-20T08:30:00.000Z'))
            .mockReturnValueOnce(new Date('2026-11-20T08:31:00.000Z'))

        const result = await Effect.runPromise(
            syncLyftaWorkouts(USER, dependencies(supabase, fetcher, importWorkout, now))
        )

        expect(calls).toEqual(['1', '2'])
        expect(importWorkout).toHaveBeenCalledTimes(2)
        expect(result).toEqual({
            created: 1,
            updated: 1,
            lastSyncedAt: '2026-11-20T08:31:00.000Z',
        })
        expect(chains[1]?.update).toHaveBeenCalledWith({
            last_synced_at: '2026-11-20T08:31:00.000Z',
        })
        expect(chains[1]?.eq).toHaveBeenCalledWith('user_id', USER.id)
    })

    it('uses the incremental UTC window with a one-day overlap', async () => {
        const syncedAt = '2026-11-20T23:30:00-03:00'
        const { supabase } = database(syncedAt)
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(page(1, 1, [])))
        const now = vi
            .fn<() => Date>()
            .mockReturnValueOnce(new Date('2026-11-22T01:00:00-08:00'))
            .mockReturnValueOnce(new Date('2026-11-22T01:01:00-08:00'))
        const importWorkout = vi.fn(() =>
            Effect.succeed({ activityId: 'activity-1', created: false })
        )

        await Effect.runPromise(
            syncLyftaWorkouts(USER, dependencies(supabase, fetcher, importWorkout, now))
        )

        const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]))
        expect(requestUrl.searchParams.get('from')).toBe('2026-11-20')
        expect(requestUrl.searchParams.get('to')).toBe('2026-11-22')
    })

    it('does not advance the checkpoint when a later page fails', async () => {
        const { chains, supabase } = database(null)
        const fetcher: typeof fetch = async (input) => {
            const pageNumber = Number(new URL(String(input)).searchParams.get('page'))
            return pageNumber === 1
                ? response(page(1, 2, [WORKOUT]))
                : response({ message: 'do not expose this body' }, 503)
        }
        const importWorkout = vi.fn(() =>
            Effect.succeed({ activityId: 'activity-1', created: true })
        )
        const now = vi.fn(() => new Date('2026-11-20T08:30:00.000Z'))

        const exit = await Effect.runPromiseExit(
            syncLyftaWorkouts(USER, dependencies(supabase, fetcher, importWorkout, now))
        )

        expect(failureTag(exit)).toBe('LyftaApiError')
        expect(importWorkout).toHaveBeenCalledTimes(1)
        expect(chains).toHaveLength(1)
    })

    it('does not advance the checkpoint after a partial application write', async () => {
        const { chains, supabase } = makeFakeDb([
            ok({ encrypted_api_key: ENCRYPTED_API_KEY, last_synced_at: null }),
            ok(null),
            ok({ id: 'activity-1' }),
            ok(),
            { data: null, error: { code: 'XX001', message: 'set insert failed' } },
        ])
        const workout = {
            ...WORKOUT,
            weight_unit: 'kg',
            exercises: [
                {
                    exercise_id: 501,
                    excercise_name: 'Bench Press',
                    sets: [{ is_completed: true, reps: '5', weight: '80' }],
                },
            ],
        }
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(page(1, 1, [workout])))
        const importWorkout = (user: User, item: LyftaWorkout) =>
            importLyftaWorkout(user, item, {
                createUserClient: async () => supabase,
                getTimezone: () => Effect.succeed('America/Los_Angeles'),
            })
        const now = vi.fn(() => new Date('2026-11-20T08:30:00.000Z'))

        const exit = await Effect.runPromiseExit(
            syncLyftaWorkouts(USER, dependencies(supabase, fetcher, importWorkout, now))
        )

        expect(failureTag(exit)).toBe('ActivityWriteError')
        expect(chains).toHaveLength(5)
    })

    it('fails without requesting Lyfta when there is no connection', async () => {
        const { supabase } = makeFakeDb([ok(null)])
        const fetcher = vi.fn<typeof fetch>()
        const importWorkout = vi.fn(() =>
            Effect.succeed({ activityId: 'activity-1', created: true })
        )
        const now = vi.fn(() => new Date('2026-11-20T08:30:00.000Z'))

        const exit = await Effect.runPromiseExit(
            syncLyftaWorkouts(USER, dependencies(supabase, fetcher, importWorkout, now))
        )

        expect(failureTag(exit)).toBe('LyftaConnectionNotFoundError')
        expect(fetcher).not.toHaveBeenCalled()
    })
})
