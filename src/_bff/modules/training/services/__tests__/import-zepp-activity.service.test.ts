// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import type { User } from '@supabase/supabase-js'
import { z } from 'zod'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import {
    findKnownZeppTrackIds,
    findZeppDuplicateTrackIds,
    importZeppActivity,
} from '@/_bff/modules/training/services/import-zepp-activity.service'
import type { AdaptedActivity, ZeppRunSummary } from '@/_bff/modules/zepp/types'

// SAFETY: the import service only reads the authenticated user's ID.
const USER = { id: 'user-zepp-1' } as User

const SUMMARY: ZeppRunSummary = {
    trackId: '1794943080',
    source: 'run.1.huami.com',
    sportType: 1,
    distanceM: 87,
    movingTimeS: 29,
    endTimeS: 1794943110,
    avgHrBpm: 150,
    maxHrBpm: 150,
    calories: null,
    sportTitle: null,
}

// 30 seconds at 3 m/s and 150 bpm.
const ACTIVITY = (startedAt: string): AdaptedActivity => ({
    startedAt,
    sportType: 'running',
    category: 'run',
    name: 'Run',
    distanceM: 87,
    movingTimeS: 29,
    elapsedTimeS: 30,
    elevationGainM: null,
    avgHr: 150,
    maxHr: 150,
    avgSpeedMps: 3,
    calories: null,
    noteText: null,
    laps: [],
    samples: Array.from({ length: 30 }, (_, index) => ({
        t: Date.parse(startedAt) + index * 1000,
        hr: 150,
        distanceM: index * 3,
        speedMps: 3,
    })),
})

const context = (supabase: ReturnType<typeof makeFakeDb>['supabase'], timeZone: string) => ({
    supabase,
    timeZone,
})

const insertedRow = (chain: ReturnType<typeof makeFakeDb>['chains'][number] | undefined) =>
    z
        .object({
            source: z.string(),
            source_id: z.string(),
            user_id: z.string(),
            local_date: z.string(),
            category: z.string(),
            hr_histogram: z.object({ bins: z.array(z.array(z.number())) }),
            pace_histogram: z.object({ bins: z.array(z.array(z.number())) }),
        })
        .parse(chain?.insert.mock.calls[0]?.[0])

describe('importZeppActivity', () => {
    it('stores the run as a zepp activity with histograms built from its samples', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok()])

        const result = await Effect.runPromise(
            importZeppActivity(
                USER,
                SUMMARY,
                ACTIVITY('2026-11-17T19:18:00.000Z'),
                context(supabase, 'Europe/Lisbon')
            )
        )

        expect(result).toEqual({ created: true })
        const row = insertedRow(chains[1])
        expect(row).toMatchObject({
            source: 'zepp',
            source_id: '1794943080',
            user_id: USER.id,
            category: 'run',
            local_date: '2026-11-17',
        })
        expect(row.hr_histogram.bins[0]?.[0]).toBe(150)
        expect(row.pace_histogram.bins.length).toBeGreaterThan(0)
    })

    it('uses the athlete timezone for the local date', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok()])

        await Effect.runPromise(
            importZeppActivity(
                USER,
                SUMMARY,
                ACTIVITY('2026-11-17T23:50:00.000Z'),
                context(supabase, 'Asia/Tokyo')
            )
        )

        expect(insertedRow(chains[1]).local_date).toBe('2026-11-18')
    })

    it('reports an already imported run as not created', async () => {
        const { supabase } = makeFakeDb([
            ok(null),
            { data: null, error: { code: '23505', message: 'duplicate key' } },
        ])

        const result = await Effect.runPromise(
            importZeppActivity(
                USER,
                SUMMARY,
                ACTIVITY('2026-11-17T19:18:00.000Z'),
                context(supabase, 'UTC')
            )
        )

        expect(result).toEqual({ created: false })
    })

    it('skips a run that starts within five minutes of an activity the athlete already has', async () => {
        const { chains, supabase } = makeFakeDb([ok({ id: 'uploaded-by-hand' })])

        const result = await Effect.runPromise(
            importZeppActivity(
                USER,
                SUMMARY,
                ACTIVITY('2026-11-17T19:18:00.000Z'),
                context(supabase, 'UTC')
            )
        )

        expect(result).toEqual({ created: false })
        expect(chains).toHaveLength(1)
        expect(chains[0]?.gte).toHaveBeenCalledWith('started_at', '2026-11-17T19:13:00.000Z')
    })

    it('does not count an earlier Zepp activity as a duplicate (a stopped start-up run)', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok()])

        await Effect.runPromise(
            importZeppActivity(
                USER,
                SUMMARY,
                ACTIVITY('2026-11-17T19:18:00.000Z'),
                context(supabase, 'UTC')
            )
        )

        expect(chains[0]?.neq).toHaveBeenCalledWith('source', 'zepp')
    })
})

describe('findKnownZeppTrackIds', () => {
    it('returns the track ids already stored as zepp activities of the user', async () => {
        const { chains, supabase } = makeFakeDb([ok([{ source_id: '1794943080' }])])

        const known = await Effect.runPromise(
            findKnownZeppTrackIds(USER, ['1794943080', '1'], context(supabase, 'UTC'))
        )

        expect([...known]).toEqual(['1794943080'])
        expect(chains[0]?.eq).toHaveBeenCalledWith('source', 'zepp')
    })
})

describe('findZeppDuplicateTrackIds', () => {
    it('returns the runs that start within five minutes of an activity the athlete already has', async () => {
        const { chains, supabase } = makeFakeDb([ok([{ started_at: '2026-11-17T19:20:22+00:00' }])])

        const duplicates = await Effect.runPromise(
            findZeppDuplicateTrackIds(USER, ['1794943080', '1794900000'], context(supabase, 'UTC'))
        )

        expect([...duplicates]).toEqual(['1794943080'])
        expect(chains[0]?.neq).toHaveBeenCalledWith('source', 'zepp')
    })

    it('does not query when there are no runs', async () => {
        const { from, supabase } = makeFakeDb([])

        const duplicates = await Effect.runPromise(
            findZeppDuplicateTrackIds(USER, [], context(supabase, 'UTC'))
        )

        expect(duplicates.size).toBe(0)
        expect(from).not.toHaveBeenCalled()
    })
})
