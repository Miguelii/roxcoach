import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import {
    deleteActivity,
    insertActivity,
    selectIdByStartedAt,
} from '@/_bff/modules/training/repositories/activities.repository'
import type { NewActivityRow } from '@/_bff/modules/training/types'

const USER_ID = 'user-1'
const ROW: NewActivityRow = {
    sport_type: 'Run',
    category: 'run',
    name: 'Morning run',
    started_at: '2026-11-20T07:00:00Z',
    local_date: '2026-11-20',
    distance_m: 10000,
    moving_time_s: 3000,
    elapsed_time_s: 3100,
    elevation_gain_m: null,
    avg_hr: null,
    max_hr: null,
    avg_speed_mps: null,
    calories: null,
}
const failed = { code: '42501', message: 'permission denied' }

describe('insertActivity', () => {
    it('inserts a manual activity with user_id and returns the new id', async () => {
        const { chains, from, supabase } = makeFakeDb([ok({ id: 'act-1' })])

        const id = await Effect.runPromise(insertActivity(supabase, USER_ID, ROW))

        expect(id).toBe('act-1')
        expect(from).toHaveBeenCalledWith('activities')
        expect(chains[0]?.insert).toHaveBeenCalledWith({
            ...ROW,
            source: 'manual',
            user_id: USER_ID,
        })
    })

    it('tags a thrown error and a returned error', async () => {
        const thrown = makeFakeDb([new Error('network down')])
        const returned = makeFakeDb([{ data: null, error: failed }])
        expect(
            failureTag(await Effect.runPromiseExit(insertActivity(thrown.supabase, USER_ID, ROW)))
        ).toBe('ActivityWriteError')
        expect(
            failureTag(await Effect.runPromiseExit(insertActivity(returned.supabase, USER_ID, ROW)))
        ).toBe('ActivityWriteError')
    })

    it('fails when no id comes back', async () => {
        const db = makeFakeDb([ok(null)])
        expect(
            failureTag(await Effect.runPromiseExit(insertActivity(db.supabase, USER_ID, ROW)))
        ).toBe('ActivityWriteError')
    })
})

describe('selectIdByStartedAt', () => {
    it('filters by user and started_at and returns the id or null', async () => {
        const hit = makeFakeDb([ok({ id: 'act-9' })])
        const miss = makeFakeDb([ok(null)])

        expect(
            await Effect.runPromise(selectIdByStartedAt(hit.supabase, USER_ID, ROW.started_at))
        ).toBe('act-9')
        expect(hit.chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(hit.chains[0]?.eq).toHaveBeenCalledWith('started_at', ROW.started_at)
        expect(
            await Effect.runPromise(selectIdByStartedAt(miss.supabase, USER_ID, ROW.started_at))
        ).toBeNull()
    })

    it('tags a thrown error and a returned error', async () => {
        const thrown = makeFakeDb([new Error('x')])
        const returned = makeFakeDb([{ data: null, error: failed }])
        expect(
            failureTag(
                await Effect.runPromiseExit(selectIdByStartedAt(thrown.supabase, USER_ID, 'a'))
            )
        ).toBe('ActivityQueryError')
        expect(
            failureTag(
                await Effect.runPromiseExit(selectIdByStartedAt(returned.supabase, USER_ID, 'a'))
            )
        ).toBe('ActivityQueryError')
    })
})

describe('deleteActivity', () => {
    it('deletes by id and user', async () => {
        const { chains, supabase } = makeFakeDb([ok()])
        await Effect.runPromise(deleteActivity(supabase, USER_ID, 'act-1'))
        expect(chains[0]?.delete).toHaveBeenCalled()
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenCalledWith('id', 'act-1')
    })

    it('tags a thrown error and a returned error', async () => {
        const thrown = makeFakeDb([new Error('x')])
        const returned = makeFakeDb([{ data: null, error: failed }])
        expect(
            failureTag(await Effect.runPromiseExit(deleteActivity(thrown.supabase, USER_ID, 'a')))
        ).toBe('ActivityWriteError')
        expect(
            failureTag(await Effect.runPromiseExit(deleteActivity(returned.supabase, USER_ID, 'a')))
        ).toBe('ActivityWriteError')
    })
})
