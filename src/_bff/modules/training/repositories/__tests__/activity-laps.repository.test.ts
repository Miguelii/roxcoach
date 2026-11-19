import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import {
    replaceLaps,
    selectLaps,
} from '@/_bff/modules/training/repositories/activity-laps.repository'
import type { LapRow } from '@/_bff/modules/strava/helpers/map-strava-activity.helper'

const USER_ID = 'user-1'
const ACTIVITY_ID = '7a1f0f4e-3b0e-4c53-9a0a-6a3a3d2f9c11'

const LAPS: LapRow[] = [
    {
        lap_index: 1,
        name: 'Lap 1',
        distance_m: 1000,
        elapsed_time_s: 300,
        moving_time_s: 295,
        avg_hr: 150,
        avg_speed_mps: 3.4,
        station: null,
    },
    {
        lap_index: 2,
        name: null,
        distance_m: 100,
        elapsed_time_s: 240,
        moving_time_s: 240,
        avg_hr: null,
        avg_speed_mps: null,
        station: 'sled_push',
    },
]

const failed = { code: '42501', message: 'permission denied' }

const runSelect = (db: ReturnType<typeof makeFakeDb>) =>
    Effect.runPromiseExit(selectLaps(db.supabase, USER_ID, ACTIVITY_ID))

describe('replaceLaps', () => {
    it('deletes the activity laps of that user, then inserts the new ones with user_id and activity_id', async () => {
        const { chains, from, supabase } = makeFakeDb([ok(), ok()])

        await Effect.runPromise(replaceLaps(supabase, USER_ID, ACTIVITY_ID, LAPS))

        expect(from).toHaveBeenNthCalledWith(1, 'activity_laps')
        expect(from).toHaveBeenNthCalledWith(2, 'activity_laps')
        const [remove, insert] = chains
        expect(remove?.delete).toHaveBeenCalled()
        expect(remove?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(remove?.eq).toHaveBeenCalledWith('activity_id', ACTIVITY_ID)
        expect(insert?.insert).toHaveBeenCalledWith(
            LAPS.map((lap) => ({ ...lap, user_id: USER_ID, activity_id: ACTIVITY_ID }))
        )
    })

    it('only deletes when the list is empty', async () => {
        const { chains, supabase } = makeFakeDb([ok(), ok()])

        await Effect.runPromise(replaceLaps(supabase, USER_ID, ACTIVITY_ID, []))

        expect(chains).toHaveLength(1)
        expect(chains[0]?.delete).toHaveBeenCalled()
    })

    it('maps thrown and returned delete errors to ActivityWriteError and skips the insert', async () => {
        const thrown = makeFakeDb([new Error('boom')])
        const returned = makeFakeDb([{ data: null, error: failed }])

        expect(
            failureTag(
                await Effect.runPromiseExit(
                    replaceLaps(thrown.supabase, USER_ID, ACTIVITY_ID, LAPS)
                )
            )
        ).toBe('ActivityWriteError')
        expect(
            failureTag(
                await Effect.runPromiseExit(
                    replaceLaps(returned.supabase, USER_ID, ACTIVITY_ID, LAPS)
                )
            )
        ).toBe('ActivityWriteError')
        expect(thrown.chains).toHaveLength(1)
        expect(returned.chains).toHaveLength(1)
    })

    it('maps thrown and returned insert errors to ActivityWriteError', async () => {
        const thrown = makeFakeDb([ok(), new Error('boom')])
        const returned = makeFakeDb([ok(), { data: null, error: failed }])

        expect(
            failureTag(
                await Effect.runPromiseExit(
                    replaceLaps(thrown.supabase, USER_ID, ACTIVITY_ID, LAPS)
                )
            )
        ).toBe('ActivityWriteError')
        expect(
            failureTag(
                await Effect.runPromiseExit(
                    replaceLaps(returned.supabase, USER_ID, ACTIVITY_ID, LAPS)
                )
            )
        ).toBe('ActivityWriteError')
    })
})

describe('selectLaps', () => {
    it('filters by user and activity, ordered by lap_index, mapped to DTOs with null preserved', async () => {
        const { chains, from, supabase } = makeFakeDb([
            ok([
                {
                    lap_index: 1,
                    name: 'Lap 1',
                    distance_m: 1000,
                    elapsed_time_s: 300,
                    moving_time_s: 295,
                    avg_hr: '150',
                    avg_speed_mps: 3.4,
                    station: null,
                },
                {
                    lap_index: 2,
                    name: null,
                    distance_m: null,
                    elapsed_time_s: null,
                    moving_time_s: null,
                    avg_hr: null,
                    avg_speed_mps: null,
                    station: 'sled_push',
                },
            ]),
        ])

        const laps = await Effect.runPromise(selectLaps(supabase, USER_ID, ACTIVITY_ID))

        expect(from).toHaveBeenCalledWith('activity_laps')
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenCalledWith('activity_id', ACTIVITY_ID)
        expect(chains[0]?.order).toHaveBeenCalledWith('lap_index', { ascending: true })
        expect(laps).toEqual([
            {
                lapIndex: 1,
                name: 'Lap 1',
                distanceM: 1000,
                elapsedTimeS: 300,
                movingTimeS: 295,
                avgHr: 150,
                avgSpeedMps: 3.4,
                station: null,
            },
            {
                lapIndex: 2,
                name: null,
                distanceM: null,
                elapsedTimeS: null,
                movingTimeS: null,
                avgHr: null,
                avgSpeedMps: null,
                station: 'sled_push',
            },
        ])
    })

    it('maps thrown, returned and malformed results to ActivityQueryError', async () => {
        const thrown = makeFakeDb([new Error('boom')])
        const returned = makeFakeDb([{ data: null, error: failed }])
        const malformed = makeFakeDb([ok([{ lap_index: 'x' }])])
        expect(failureTag(await runSelect(thrown))).toBe('ActivityQueryError')
        expect(failureTag(await runSelect(returned))).toBe('ActivityQueryError')
        expect(failureTag(await runSelect(malformed))).toBe('ActivityQueryError')
    })
})
