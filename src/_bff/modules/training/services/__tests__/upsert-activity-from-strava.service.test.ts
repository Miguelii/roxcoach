import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import { upsertActivityFromStrava } from '@/_bff/modules/training/services/upsert-activity-from-strava.service'
import type { ActivityRow, LapRow } from '@/_bff/modules/strava/helpers/map-strava-activity.helper'

const USER_ID = 'user-1'
const ACTIVITY_ID = '7a1f0f4e-3b0e-4c53-9a0a-6a3a3d2f9c11'

const ROW: ActivityRow = {
    strava_id: 987654321,
    source: 'strava',
    category: 'hyrox',
    sport_type: 'Workout',
    name: 'Hyrox session',
    started_at: '2026-11-18T07:30:00.000Z',
    local_date: '2026-11-18',
    distance_m: 8000,
    moving_time_s: 4000,
    elapsed_time_s: 4100,
    elevation_gain_m: null,
    avg_hr: 160,
    max_hr: 185,
    avg_speed_mps: null,
    calories: 800,
}

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
]

describe('upsertActivityFromStrava', () => {
    it('upserts the activity, then replaces its laps with the returned id, and returns the id', async () => {
        // find (none), insert, laps delete, laps insert
        const { chains, from, supabase } = makeFakeDb([
            ok(null),
            ok({ id: ACTIVITY_ID }),
            ok(),
            ok(),
        ])

        const id = await Effect.runPromise(upsertActivityFromStrava(supabase, USER_ID, ROW, LAPS))

        expect(id).toBe(ACTIVITY_ID)
        expect(from.mock.calls.map(([table]) => table)).toEqual([
            'activities',
            'activities',
            'activity_laps',
            'activity_laps',
        ])
        expect(chains[2]?.eq).toHaveBeenCalledWith('activity_id', ACTIVITY_ID)
        expect(chains[3]?.insert).toHaveBeenCalledWith([
            { ...LAPS[0], user_id: USER_ID, activity_id: ACTIVITY_ID },
        ])
    })

    it('replaces the laps of an existing activity (re-sync) without creating a second row', async () => {
        const { chains, supabase } = makeFakeDb([ok({ id: ACTIVITY_ID }), ok(), ok(), ok()])

        const id = await Effect.runPromise(upsertActivityFromStrava(supabase, USER_ID, ROW, LAPS))

        expect(id).toBe(ACTIVITY_ID)
        expect(chains[1]?.update).toHaveBeenCalled()
        expect(chains[1]?.insert).not.toHaveBeenCalled()
    })

    it('does not touch the laps when the activity upsert fails', async () => {
        const { from, supabase } = makeFakeDb([new Error('boom')])

        const exit = await Effect.runPromiseExit(
            upsertActivityFromStrava(supabase, USER_ID, ROW, LAPS)
        )

        expect(failureTag(exit)).toBe('ActivityWriteError')
        expect(from).toHaveBeenCalledTimes(1)
    })

    it('fails with ActivityWriteError when replacing the laps fails', async () => {
        const { supabase } = makeFakeDb([
            ok(null),
            ok({ id: ACTIVITY_ID }),
            { data: null, error: { code: '42501', message: 'denied' } },
        ])

        const exit = await Effect.runPromiseExit(
            upsertActivityFromStrava(supabase, USER_ID, ROW, LAPS)
        )

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })
})
