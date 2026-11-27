// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { z } from 'zod'
import { DEFAULT_RUN_TYPE_RULES } from '@/_bff/core/constants/weekly-goals.constants'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import {
    findKnownZeppTrackIds,
    findZeppDuplicateTrackIds,
    findZeppRunsWithoutLaps,
    importZeppActivity,
    replaceZeppLaps,
} from '@/_bff/modules/training/services/import-zepp-activity.service'
import type { ParsedLap } from '@/_bff/modules/training/types'
import type { AdaptedActivity, ZeppRunSummary } from '@/_bff/modules/zepp/types'

const USER = 'user-zepp-1'

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

const LAP: ParsedLap = {
    lapIndex: 1,
    name: null,
    startedAt: '2026-11-17T19:18:00.000Z',
    elapsedTimeS: 30,
    movingTimeS: 29,
    distanceM: 87,
    avgHr: 150,
    avgSpeedMps: 3,
    calories: null,
}

const LAP_ROW = {
    lap_index: 1,
    name: null,
    distance_m: 87,
    elapsed_time_s: 30,
    moving_time_s: 29,
    avg_hr: 150,
    avg_speed_mps: 3,
    station: null,
    user_id: USER,
    activity_id: 'activity-1',
}

const context = (
    supabase: ReturnType<typeof makeFakeDb>['supabase'],
    timeZone: string,
    runTypeRules = DEFAULT_RUN_TYPE_RULES
) => ({
    supabase,
    timeZone,
    runTypeRules,
})

const insertedRow = (chain: ReturnType<typeof makeFakeDb>['chains'][number] | undefined) =>
    z
        .object({
            source: z.string(),
            source_id: z.string(),
            user_id: z.string(),
            local_date: z.string(),
            category: z.string(),
            run_type: z.string().nullable(),
            hr_histogram: z.object({ bins: z.array(z.array(z.number())) }),
            pace_histogram: z.object({ bins: z.array(z.array(z.number())) }),
        })
        .parse(chain?.insert.mock.calls[0]?.[0])

describe('importZeppActivity', () => {
    it('stores the run as a zepp activity with histograms built from its samples', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok({ id: 'activity-1' })])

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
            user_id: USER,
            category: 'run',
            local_date: '2026-11-17',
        })
        expect(row.hr_histogram.bins[0]?.[0]).toBe(150)
        expect(row.pace_histogram.bins.length).toBeGreaterThan(0)
        expect(chains).toHaveLength(2)
    })

    it('a Zepp run gets its type from context.runTypeRules', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok({ id: 'activity-1' })])
        const rules = { shortRunMaxM: 50, longRunMinM: 80, fastPaceSPerKm: 300 }

        await Effect.runPromise(
            importZeppActivity(
                USER,
                SUMMARY,
                ACTIVITY('2026-11-17T19:18:00.000Z'),
                context(supabase, 'UTC', rules)
            )
        )

        expect(insertedRow(chains[1]).run_type).toBe('long')
    })

    it('stores the laps of the run with the new activity', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok({ id: 'activity-1' }), ok()])

        const result = await Effect.runPromise(
            importZeppActivity(
                USER,
                SUMMARY,
                { ...ACTIVITY('2026-11-17T19:18:00.000Z'), laps: [LAP] },
                context(supabase, 'UTC')
            )
        )

        expect(result).toEqual({ created: true })
        expect(chains[2]?.insert).toHaveBeenCalledWith([LAP_ROW])
    })

    it('removes the new activity when its laps cannot be stored, so the next sync retries it', async () => {
        const { chains, supabase } = makeFakeDb([
            ok(null),
            ok({ id: 'activity-1' }),
            { data: null, error: { code: '500', message: 'boom' } },
            ok([{ id: 'activity-1' }]),
        ])

        const exit = await Effect.runPromiseExit(
            importZeppActivity(
                USER,
                SUMMARY,
                { ...ACTIVITY('2026-11-17T19:18:00.000Z'), laps: [LAP] },
                context(supabase, 'UTC')
            )
        )

        expect(exit._tag).toBe('Failure')
        expect(chains[3]?.delete).toHaveBeenCalled()
        expect(chains[3]?.eq).toHaveBeenCalledWith('id', 'activity-1')
    })

    it('uses the athlete timezone for the local date', async () => {
        const { chains, supabase } = makeFakeDb([ok(null), ok({ id: 'activity-1' })])

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
        const { chains, supabase } = makeFakeDb([ok(null), ok({ id: 'activity-1' })])

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

describe('findZeppRunsWithoutLaps', () => {
    it('maps each imported run that has no laps to its activity id', async () => {
        const { chains, supabase } = makeFakeDb([
            ok([
                { id: 'activity-1', source_id: '1' },
                { id: 'activity-2', source_id: '2' },
            ]),
            ok([{ activity_id: 'activity-1' }]),
        ])

        const missing = await Effect.runPromise(
            findZeppRunsWithoutLaps(USER, ['1', '2'], context(supabase, 'UTC'))
        )

        expect([...missing]).toEqual([['2', 'activity-2']])
        expect(chains[0]?.eq).toHaveBeenCalledWith('source', 'zepp')
        expect(chains[1]?.in).toHaveBeenCalledWith('activity_id', ['activity-1', 'activity-2'])
    })

    it('does not query when there are no runs', async () => {
        const { from, supabase } = makeFakeDb([])

        const missing = await Effect.runPromise(
            findZeppRunsWithoutLaps(USER, [], context(supabase, 'UTC'))
        )

        expect(missing.size).toBe(0)
        expect(from).not.toHaveBeenCalled()
    })
})

describe('replaceZeppLaps', () => {
    it('writes the laps of an imported run', async () => {
        const { chains, supabase } = makeFakeDb([ok(), ok()])

        await Effect.runPromise(
            replaceZeppLaps(USER, 'activity-1', [LAP], context(supabase, 'UTC'))
        )

        expect(chains[0]?.delete).toHaveBeenCalled()
        expect(chains[1]?.insert).toHaveBeenCalledWith([LAP_ROW])
    })
})
