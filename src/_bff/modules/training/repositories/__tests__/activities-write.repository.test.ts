import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import {
    deleteActivity,
    insertActivity,
    upsertLyftaActivity,
} from '@/_bff/modules/training/repositories/activities.repository'
import type { LyftaActivityRow, NewActivityRow } from '@/_bff/modules/training/types'

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
    hr_histogram: { v: 1, bins: [[150, 60, 200]] },
    pace_histogram: { v: 1, bins: [[300, 60, 200]] },
}
const failed = { code: '42501', message: 'permission denied' }
const LYFTA_ROW: LyftaActivityRow = {
    source_id: '1001',
    category: 'strength',
    sport_type: 'strength',
    name: 'Upper Strength',
    started_at: '2026-08-20T17:05:00Z',
    local_date: '2026-08-20',
    elapsed_time_s: 2710,
    body_weight_kg: 72.5,
    lyfta_total_volume_kg_reps: 1840,
}

describe('upsertLyftaActivity', () => {
    it('uses the tenant-scoped provider key and does not send local fields', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok({ id: 'lyfta-act-1' })])

        const result = await Effect.runPromise(upsertLyftaActivity(supabase, USER_ID, LYFTA_ROW))

        expect(result).toEqual({ activityId: 'lyfta-act-1', created: true })
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(1, 'user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(2, 'source', 'lyfta')
        expect(chains[0]?.eq).toHaveBeenNthCalledWith(3, 'source_id', '1001')
        expect(chains[1]?.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ ...LYFTA_ROW, user_id: USER_ID, source: 'lyfta' }),
            { onConflict: 'user_id,source,source_id', defaultToNull: false }
        )
        expect(chains[1]?.upsert.mock.calls[0]?.[0]).not.toHaveProperty('notes')
        expect(chains[1]?.upsert.mock.calls[0]?.[0]).not.toHaveProperty('perceived_effort')
    })

    it('reports an existing source id as updated and handles lookup failures', async () => {
        const existing = makeFakeDb([ok({ id: 'lyfta-act-1' }), ok({ id: 'lyfta-act-1' })])
        const failedLookup = makeFakeDb([{ data: null, error: failed }])

        await expect(
            Effect.runPromise(upsertLyftaActivity(existing.supabase, USER_ID, LYFTA_ROW))
        ).resolves.toEqual({ activityId: 'lyfta-act-1', created: false })
        expect(
            failureTag(
                await Effect.runPromiseExit(
                    upsertLyftaActivity(failedLookup.supabase, USER_ID, LYFTA_ROW)
                )
            )
        ).toBe('ActivityQueryError')
    })
})

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
        expect(chains[0]?.insert.mock.calls[0]?.[0]).toHaveProperty(
            'hr_histogram',
            ROW.hr_histogram
        )
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

describe('deleteActivity', () => {
    it('fails when no row was removed', async () => {
        const db = makeFakeDb([{ data: [], error: null }])
        expect(
            failureTag(await Effect.runPromiseExit(deleteActivity(db.supabase, USER_ID, 'a')))
        ).toBe('ActivityWriteError')
    })

    it('deletes by id and user', async () => {
        const { chains, supabase } = makeFakeDb([ok([{ id: 'act-1' }])])
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
