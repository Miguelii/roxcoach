import { describe, expect, it } from 'vitest'
import { Cause, Effect, Exit, Option } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import {
    ACTIVITY_ID,
    DB_ROW,
    DTO,
} from '@/_bff/modules/training/repositories/__tests__/activity-fixtures'
import { makeFakeDb, ok } from '@/_bff/modules/training/repositories/__tests__/fake-db'
import {
    countStravaActivities,
    selectActivitiesInRange,
    selectActivityById,
} from '@/_bff/modules/training/repositories/activities.repository'

const USER_ID = 'user-1'
const failed = { code: '42501', message: 'permission denied', details: 'row details', hint: 'h' }

const failureCause = (exit: Exit.Exit<unknown, { cause: unknown }>) => {
    if (!Exit.isFailure(exit)) throw new Error('expected a failure')
    const failure = Cause.findErrorOption(exit.cause)
    if (Option.isNone(failure)) throw new Error('expected a typed failure')
    return String(failure.value.cause)
}

const runRange = (db: ReturnType<typeof makeFakeDb>) =>
    Effect.runPromiseExit(selectActivitiesInRange(db.supabase, USER_ID, 'a', 'b'))

describe('selectActivitiesInRange', () => {
    it('filters by user, plain date range and soft delete, ordered by started_at, mapped to DTOs', async () => {
        const { chains, from, supabase } = makeFakeDb([ok([DB_ROW])])

        const result = await Effect.runPromise(
            selectActivitiesInRange(supabase, USER_ID, '2026-11-16', '2026-11-22')
        )

        expect(result).toEqual([DTO])
        expect(from).toHaveBeenCalledWith('activities')
        const chain = chains[0]
        expect(chain?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chain?.is).toHaveBeenCalledWith('deleted_at', null)
        expect(chain?.gte).toHaveBeenCalledWith('local_date', '2026-11-16')
        expect(chain?.lte).toHaveBeenCalledWith('local_date', '2026-11-22')
        expect(chain?.order).toHaveBeenCalledWith('started_at', { ascending: true })
    })

    it('preserves null values and coerces numeric strings', async () => {
        const { supabase } = makeFakeDb([
            ok([
                {
                    ...DB_ROW,
                    distance_m: '10000.5',
                    strava_id: null,
                    source: 'manual',
                    perceived_effort: 7,
                    notes: 'felt good',
                },
            ]),
        ])

        const [activity] = await Effect.runPromise(
            selectActivitiesInRange(supabase, USER_ID, '2026-11-16', '2026-11-22')
        )

        expect(activity?.distanceM).toBe(10000.5)
        expect(activity?.stravaId).toBeNull()
        expect(activity?.maxHr).toBeNull()
        expect(activity?.perceivedEffort).toBe(7)
        expect(activity?.notes).toBe('felt good')
    })

    it('returns an empty list when nothing matches', async () => {
        const { supabase } = makeFakeDb([ok([])])

        const result = await Effect.runPromise(
            selectActivitiesInRange(supabase, USER_ID, '2026-11-16', '2026-11-22')
        )

        expect(result).toEqual([])
    })

    it('maps a thrown error, a returned error and a malformed row to ActivityQueryError', async () => {
        const thrown = makeFakeDb([new Error('boom')])
        const returned = makeFakeDb([{ data: null, error: failed }])
        const malformed = makeFakeDb([ok([{ ...DB_ROW, local_date: null }])])
        expect(failureTag(await runRange(thrown))).toBe('ActivityQueryError')
        expect(failureTag(await runRange(returned))).toBe('ActivityQueryError')
        expect(failureTag(await runRange(malformed))).toBe('ActivityQueryError')
        expect(failureCause(await runRange(returned))).toBe('42501: permission denied')
    })
})

describe('selectActivityById', () => {
    it('filters by id, user and soft delete and returns the DTO', async () => {
        const { chains, supabase } = makeFakeDb([ok(DB_ROW)])

        const result = await Effect.runPromise(selectActivityById(supabase, USER_ID, ACTIVITY_ID))

        expect(result).toEqual(DTO)
        const chain = chains[0]
        expect(chain?.eq).toHaveBeenCalledWith('id', ACTIVITY_ID)
        expect(chain?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chain?.is).toHaveBeenCalledWith('deleted_at', null)
        expect(chain?.maybeSingle).toHaveBeenCalled()
    })

    it('returns null when there is no such activity', async () => {
        const { supabase } = makeFakeDb([ok(null)])

        const result = await Effect.runPromise(selectActivityById(supabase, USER_ID, ACTIVITY_ID))

        expect(result).toBeNull()
    })

    it('maps thrown and returned errors to ActivityQueryError', async () => {
        const thrown = makeFakeDb([new Error('boom')])
        const returned = makeFakeDb([{ data: null, error: failed }])

        expect(
            failureTag(
                await Effect.runPromiseExit(
                    selectActivityById(thrown.supabase, USER_ID, ACTIVITY_ID)
                )
            )
        ).toBe('ActivityQueryError')
        expect(
            failureTag(
                await Effect.runPromiseExit(
                    selectActivityById(returned.supabase, USER_ID, ACTIVITY_ID)
                )
            )
        ).toBe('ActivityQueryError')
    })
})

describe('countStravaActivities', () => {
    it('counts the user strava activities that are not soft-deleted', async () => {
        const { chains, supabase } = makeFakeDb([{ count: 42, error: null }])

        const count = await Effect.runPromise(countStravaActivities(supabase, USER_ID))

        expect(count).toBe(42)
        const chain = chains[0]
        expect(chain?.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
        expect(chain?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chain?.not).toHaveBeenCalledWith('strava_id', 'is', null)
        expect(chain?.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('counts zero when no count is returned', async () => {
        const { supabase } = makeFakeDb([{ count: null, error: null }])

        expect(await Effect.runPromise(countStravaActivities(supabase, USER_ID))).toBe(0)
    })

    it('maps thrown and returned errors to ActivityQueryError', async () => {
        const thrown = makeFakeDb([new Error('boom')])
        const returned = makeFakeDb([{ error: failed }])

        expect(
            failureTag(await Effect.runPromiseExit(countStravaActivities(thrown.supabase, USER_ID)))
        ).toBe('ActivityQueryError')
        expect(
            failureTag(
                await Effect.runPromiseExit(countStravaActivities(returned.supabase, USER_ID))
            )
        ).toBe('ActivityQueryError')
    })
})
