import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import {
    insertZeppActivity,
    selectIdNearStartedAt,
    selectSourceIds,
    selectStartedAtsBetween,
} from '@/_bff/modules/training/repositories/activities.repository'
import type { NewZeppActivityRow } from '@/_bff/modules/training/types'

const USER_ID = 'user-1'
const ROW: NewZeppActivityRow = {
    source_id: '1794943080',
    sport_type: 'running',
    category: 'run',
    name: 'Run',
    started_at: '2026-11-17T19:18:00.000Z',
    local_date: '2026-11-17',
    distance_m: 3119.12,
    moving_time_s: 722,
    elapsed_time_s: 1329,
    elevation_gain_m: null,
    avg_hr: 143,
    max_hr: 166,
    avg_speed_mps: 4.32,
    calories: 85,
    hr_histogram: { v: 1, bins: [[150, 60, 200]] },
    pace_histogram: { v: 1, bins: [[300, 60, 200]] },
}

describe('insertZeppActivity', () => {
    it('inserts a zepp activity owned by the user', async () => {
        const { chains, from, supabase } = makeFakeDb([ok()])

        const result = await Effect.runPromise(insertZeppActivity(supabase, USER_ID, ROW))

        expect(result).toEqual({ created: true })
        expect(from).toHaveBeenCalledWith('activities')
        expect(chains[0]?.insert).toHaveBeenCalledWith({
            ...ROW,
            source: 'zepp',
            user_id: USER_ID,
        })
    })

    it('reports an activity that was already imported (a second press of Sync) as not created', async () => {
        const { supabase } = makeFakeDb([
            { data: null, error: { code: '23505', message: 'duplicate key' } },
        ])

        const result = await Effect.runPromise(insertZeppActivity(supabase, USER_ID, ROW))

        expect(result).toEqual({ created: false })
    })

    it('fails with a write error on any other failure and on a rejected query', async () => {
        const returned = makeFakeDb([{ data: null, error: { code: '42501', message: 'denied' } }])
        const rejected = makeFakeDb([new Error('network')])

        expect(
            failureTag(
                await Effect.runPromiseExit(insertZeppActivity(returned.supabase, USER_ID, ROW))
            )
        ).toBe('ActivityWriteError')
        expect(
            failureTag(
                await Effect.runPromiseExit(insertZeppActivity(rejected.supabase, USER_ID, ROW))
            )
        ).toBe('ActivityWriteError')
    })
})

describe('selectSourceIds', () => {
    it('returns the known ids of that user and source', async () => {
        const { chains, supabase } = makeFakeDb([ok([{ source_id: 'a' }, { source_id: 'b' }])])

        const ids = await Effect.runPromise(
            selectSourceIds(supabase, USER_ID, 'zepp', ['a', 'b', 'c'])
        )

        expect([...ids].toSorted()).toEqual(['a', 'b'])
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenCalledWith('source', 'zepp')
        expect(chains[0]?.in).toHaveBeenCalledWith('source_id', ['a', 'b', 'c'])
    })

    it('does not query when there is nothing to look up', async () => {
        const { from, supabase } = makeFakeDb([])

        expect((await Effect.runPromise(selectSourceIds(supabase, USER_ID, 'zepp', []))).size).toBe(
            0
        )
        expect(from).not.toHaveBeenCalled()
    })

    it('fails with a query error', async () => {
        const { supabase } = makeFakeDb([{ data: null, error: { code: 'XX', message: 'failed' } }])

        expect(
            failureTag(
                await Effect.runPromiseExit(selectSourceIds(supabase, USER_ID, 'zepp', ['a']))
            )
        ).toBe('ActivityQueryError')
    })
})

describe('selectIdNearStartedAt', () => {
    it('looks for a live activity of the user inside the window around the start', async () => {
        const { chains, supabase } = makeFakeDb([ok({ id: 'activity-9' })])

        const id = await Effect.runPromise(
            selectIdNearStartedAt(supabase, USER_ID, '2026-11-17T19:18:00.000Z', 300)
        )

        expect(id).toBe('activity-9')
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.gte).toHaveBeenCalledWith('started_at', '2026-11-17T19:13:00.000Z')
        expect(chains[0]?.lte).toHaveBeenCalledWith('started_at', '2026-11-17T19:23:00.000Z')
        expect(chains[0]?.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('returns null when nothing is there', async () => {
        const { supabase } = makeFakeDb([ok(null)])

        expect(
            await Effect.runPromise(
                selectIdNearStartedAt(supabase, USER_ID, '2026-11-17T19:18:00.000Z', 300)
            )
        ).toBeNull()
    })
})

describe('selectIdNearStartedAt excluding a source', () => {
    it('leaves out the activities of that source', async () => {
        const { chains, supabase } = makeFakeDb([ok(null)])

        await Effect.runPromise(
            selectIdNearStartedAt(supabase, USER_ID, '2026-11-17T19:18:00.000Z', 300, 'zepp')
        )

        expect(chains[0]?.neq).toHaveBeenCalledWith('source', 'zepp')
    })

    it('looks at every source when none is excluded', async () => {
        const { chains, supabase } = makeFakeDb([ok(null)])

        await Effect.runPromise(
            selectIdNearStartedAt(supabase, USER_ID, '2026-11-17T19:18:00.000Z', 300)
        )

        expect(chains[0]?.neq).not.toHaveBeenCalled()
    })
})

describe('selectStartedAtsBetween', () => {
    it('returns the start times of the live activities of the user inside the range', async () => {
        const { chains, supabase } = makeFakeDb([
            ok([
                { started_at: '2026-11-17T19:20:22+00:00' },
                { started_at: '2026-11-18T07:00:00Z' },
            ]),
        ])

        const starts = await Effect.runPromise(
            selectStartedAtsBetween(
                supabase,
                USER_ID,
                '2026-11-17T00:00:00.000Z',
                '2026-11-19T00:00:00.000Z',
                'zepp'
            )
        )

        expect(starts).toEqual(['2026-11-17T19:20:22+00:00', '2026-11-18T07:00:00Z'])
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.gte).toHaveBeenCalledWith('started_at', '2026-11-17T00:00:00.000Z')
        expect(chains[0]?.lte).toHaveBeenCalledWith('started_at', '2026-11-19T00:00:00.000Z')
        expect(chains[0]?.is).toHaveBeenCalledWith('deleted_at', null)
        expect(chains[0]?.neq).toHaveBeenCalledWith('source', 'zepp')
    })

    it('fails with a query error', async () => {
        const { supabase } = makeFakeDb([{ data: null, error: { code: 'XX', message: 'failed' } }])

        expect(
            failureTag(
                await Effect.runPromiseExit(selectStartedAtsBetween(supabase, USER_ID, 'a', 'b'))
            )
        ).toBe('ActivityQueryError')
    })
})
