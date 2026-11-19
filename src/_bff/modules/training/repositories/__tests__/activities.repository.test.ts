import { describe, expect, it } from 'vitest'
import { Cause, Effect, Exit, Option } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { ACTIVITY_ID } from '@/_bff/modules/training/repositories/__tests__/activity-fixtures'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import {
    selectExistingStravaIds,
    softDeleteByStravaId,
    upsertStravaActivity,
} from '@/_bff/modules/training/repositories/activities.repository'
import type { ActivityRow } from '@/_bff/modules/strava/helpers/map-strava-activity.helper'

const USER_ID = 'user-1'

const ROW: ActivityRow = {
    strava_id: 987654321,
    source: 'strava',
    category: 'run',
    sport_type: 'Run',
    name: 'Morning run',
    started_at: '2026-11-18T07:30:00.000Z',
    local_date: '2026-11-18',
    distance_m: 10000,
    moving_time_s: 3000,
    elapsed_time_s: 3100,
    elevation_gain_m: 45.5,
    avg_hr: 150,
    max_hr: 175,
    avg_speed_mps: 3.33,
    calories: null,
}

const failed = { code: '42501', message: 'permission denied', details: 'row details', hint: 'h' }

const failureCause = (exit: Exit.Exit<unknown, { cause: unknown }>) => {
    if (!Exit.isFailure(exit)) throw new Error('expected a failure')
    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isNone(failure)) throw new Error('expected a typed failure')
    return String(failure.value.cause)
}

describe('upsertStravaActivity', () => {
    it('inserts a new activity with user_id when no row has that strava_id, and returns its id', async () => {
        const { chains, from, supabase } = makeFakeDb([ok(null), ok({ id: ACTIVITY_ID })])

        const id = await Effect.runPromise(upsertStravaActivity(supabase, USER_ID, ROW))

        expect(id).toBe(ACTIVITY_ID)
        expect(from).toHaveBeenNthCalledWith(1, 'activities')
        expect(from).toHaveBeenNthCalledWith(2, 'activities')
        const [find, insert] = chains
        expect(find?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(find?.eq).toHaveBeenCalledWith('strava_id', ROW.strava_id)
        expect(insert?.insert).toHaveBeenCalledWith({ ...ROW, user_id: USER_ID, deleted_at: null })
    })

    it('updates the existing row, clears deleted_at and returns the existing id', async () => {
        const { chains, supabase } = makeFakeDb([ok({ id: ACTIVITY_ID }), ok()])

        const id = await Effect.runPromise(upsertStravaActivity(supabase, USER_ID, ROW))

        expect(id).toBe(ACTIVITY_ID)
        const update = chains[1]
        expect(update?.update).toHaveBeenCalledWith({ ...ROW, deleted_at: null })
        expect(update?.eq).toHaveBeenCalledWith('id', ACTIVITY_ID)
        expect(update?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains).toHaveLength(2)
    })

    it('is idempotent: a second call with the same strava_id updates instead of inserting', async () => {
        const first = makeFakeDb([ok(null), ok({ id: ACTIVITY_ID })])
        const second = makeFakeDb([ok({ id: ACTIVITY_ID }), ok()])

        const firstId = await Effect.runPromise(upsertStravaActivity(first.supabase, USER_ID, ROW))
        const secondId = await Effect.runPromise(
            upsertStravaActivity(second.supabase, USER_ID, ROW)
        )

        expect(secondId).toBe(firstId)
        expect(second.chains.some((chain) => chain.insert.mock.calls.length > 0)).toBe(false)
    })

    it('recovers from a concurrent insert (unique violation) by updating the row that won', async () => {
        const { chains, supabase } = makeFakeDb([
            ok(null),
            { data: null, error: { code: '23505', message: 'duplicate key value' } },
            ok({ id: ACTIVITY_ID }),
            ok(),
        ])

        const id = await Effect.runPromise(upsertStravaActivity(supabase, USER_ID, ROW))

        expect(id).toBe(ACTIVITY_ID)
        expect(chains).toHaveLength(4)
        expect(chains[3]?.update).toHaveBeenCalledWith({ ...ROW, deleted_at: null })
    })

    it('maps a thrown lookup to ActivityWriteError', async () => {
        const { supabase } = makeFakeDb([new Error('socket closed')])

        const exit = await Effect.runPromiseExit(upsertStravaActivity(supabase, USER_ID, ROW))

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })

    it('maps a returned lookup error to ActivityWriteError keeping only code and message', async () => {
        const { supabase } = makeFakeDb([{ data: null, error: failed }])

        const exit = await Effect.runPromiseExit(upsertStravaActivity(supabase, USER_ID, ROW))

        expect(failureTag(exit)).toBe('ActivityWriteError')
        expect(failureCause(exit)).toBe('42501: permission denied')
    })

    it('maps a returned insert error that is not a unique violation to ActivityWriteError', async () => {
        const { supabase } = makeFakeDb([ok(null), { data: null, error: failed }])

        const exit = await Effect.runPromiseExit(upsertStravaActivity(supabase, USER_ID, ROW))

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })

    it('maps a thrown insert to ActivityWriteError', async () => {
        const { supabase } = makeFakeDb([ok(null), new Error('boom')])

        const exit = await Effect.runPromiseExit(upsertStravaActivity(supabase, USER_ID, ROW))

        expect(failureTag(exit)).toBe('ActivityWriteError')
    })

    it('maps a thrown and a returned update error to ActivityWriteError', async () => {
        const thrown = makeFakeDb([ok({ id: ACTIVITY_ID }), new Error('boom')])
        const returned = makeFakeDb([ok({ id: ACTIVITY_ID }), { data: null, error: failed }])

        const thrownExit = await Effect.runPromiseExit(
            upsertStravaActivity(thrown.supabase, USER_ID, ROW)
        )
        const returnedExit = await Effect.runPromiseExit(
            upsertStravaActivity(returned.supabase, USER_ID, ROW)
        )

        expect(failureTag(thrownExit)).toBe('ActivityWriteError')
        expect(failureTag(returnedExit)).toBe('ActivityWriteError')
    })
})

describe('softDeleteByStravaId', () => {
    it('sets deleted_at on the matching strava activity of that user, not yet deleted', async () => {
        const { chains, from, supabase } = makeFakeDb([ok()])

        await Effect.runPromise(softDeleteByStravaId(supabase, USER_ID, 987654321))

        expect(from).toHaveBeenCalledWith('activities')
        const chain = chains[0]
        expect(chain?.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) })
        expect(chain?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chain?.eq).toHaveBeenCalledWith('strava_id', 987654321)
        expect(chain?.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('maps thrown and returned errors to ActivityWriteError', async () => {
        const thrown = makeFakeDb([new Error('boom')])
        const returned = makeFakeDb([{ data: null, error: failed }])

        expect(
            failureTag(
                await Effect.runPromiseExit(softDeleteByStravaId(thrown.supabase, USER_ID, 1))
            )
        ).toBe('ActivityWriteError')
        expect(
            failureTag(
                await Effect.runPromiseExit(softDeleteByStravaId(returned.supabase, USER_ID, 1))
            )
        ).toBe('ActivityWriteError')
    })
})

describe('selectExistingStravaIds', () => {
    it('returns the live stored ids among the listed ones, filtered by user', async () => {
        const { chains, from, supabase } = makeFakeDb([ok([{ strava_id: 2 }, { strava_id: 3 }])])

        const ids = await Effect.runPromise(selectExistingStravaIds(supabase, USER_ID, [1, 2, 3]))

        expect(ids).toEqual(new Set([2, 3]))
        expect(from).toHaveBeenCalledWith('activities')
        const chain = chains[0]
        expect(chain?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chain?.in).toHaveBeenCalledWith('strava_id', [1, 2, 3])
        // A soft-deleted activity does not count as stored, so it is synced again.
        expect(chain?.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('does not query for an empty list', async () => {
        const { from, supabase } = makeFakeDb([ok([])])

        const ids = await Effect.runPromise(selectExistingStravaIds(supabase, USER_ID, []))

        expect(ids.size).toBe(0)
        expect(from).not.toHaveBeenCalled()
    })

    it('maps thrown, returned and malformed results to ActivityQueryError', async () => {
        const thrown = makeFakeDb([new Error('boom')])
        const returned = makeFakeDb([{ data: null, error: failed }])
        const malformed = makeFakeDb([ok([{ strava_id: 'x' }])])

        const exits = await Promise.all(
            [thrown, returned, malformed].map(({ supabase }) =>
                Effect.runPromiseExit(selectExistingStravaIds(supabase, USER_ID, [1]))
            )
        )

        expect(exits.map((exit) => failureTag(exit))).toEqual(exits.map(() => 'ActivityQueryError'))
    })
})
