// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/_bff/trpc/router'
import { ErrorCode } from '@/_bff/lib/error-codes'
import {
    RaceNotFoundError,
    RaceQueryError,
    RaceStateError,
    RaceValidationError,
} from '@/_bff/lib/errors'
import type { RaceDTO, RaceInput } from '@/_bff/modules/races/types'

const mocks = vi.hoisted(() => ({
    listRaces: vi.fn(),
    createRace: vi.fn(),
    updateRace: vi.fn(),
    cancelRace: vi.fn(),
    restoreRace: vi.fn(),
    completeRace: vi.fn(),
    deleteRace: vi.fn(),
    getSession: vi.fn(),
}))

vi.mock('@/_bff/modules/races/services/list-races.service', () => ({ listRaces: mocks.listRaces }))
vi.mock('@/_bff/modules/races/services/create-race.service', () => ({
    createRace: mocks.createRace,
}))
vi.mock('@/_bff/modules/races/services/update-race.service', () => ({
    updateRace: mocks.updateRace,
    cancelRace: mocks.cancelRace,
    restoreRace: mocks.restoreRace,
}))
vi.mock('@/_bff/modules/races/services/complete-race.service', () => ({
    completeRace: mocks.completeRace,
}))
vi.mock('@/_bff/modules/races/services/delete-race.service', () => ({
    deleteRace: mocks.deleteRace,
}))
vi.mock('@/_bff/modules/auth/services/get-session.service', () => ({
    getSession: mocks.getSession,
}))
vi.mock('@/_bff/modules/auth/services/get-cached-claims.service', () => ({
    getCachedClaims: vi.fn().mockResolvedValue(null),
}))

const USER = { id: 'user-1', app_metadata: { roxcoach: true } }
const caller = appRouter.createCaller({})
const ID = '11111111-1111-4111-8111-111111111111'

const INPUT: RaceInput = {
    name: 'Hyrox Lisbon',
    raceType: 'hyrox',
    raceDate: '2027-03-06',
    location: null,
    distanceM: null,
    hyroxDivision: 'open_men',
    targetTimeS: 4200,
    priority: 'A',
    notes: null,
}
const RACE: RaceDTO = { ...INPUT, id: ID, status: 'upcoming', resultTimeS: null }

const code = ErrorCode.RACES_INVALID
const failWith = {
    validation: () =>
        Effect.fail(new RaceValidationError({ cause: 'bad', error_hash: code, field: 'name' })),
    notFound: () => Effect.fail(new RaceNotFoundError({ cause: 'x', error_hash: code })),
    state: () => Effect.fail(new RaceStateError({ cause: 'x', error_hash: code })),
    query: () => Effect.fail(new RaceQueryError({ cause: '42501: denied', error_hash: code })),
}

const caught = async (promise: Promise<unknown>): Promise<TRPCError> => {
    try {
        await promise
    } catch (error) {
        if (error instanceof TRPCError) return error
    }
    throw new Error('expected a TRPCError')
}

describe('races controllers', () => {
    beforeEach(() => {
        for (const mock of Object.values(mocks)) mock.mockReset()
        mocks.getSession.mockReturnValue(Effect.succeed(USER))
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('list passes the status filter and returns the races', async () => {
        mocks.listRaces.mockReturnValue(Effect.succeed([RACE]))

        await expect(caller.races.list({ status: ['upcoming'] })).resolves.toEqual([RACE])
        expect(mocks.listRaces).toHaveBeenCalledWith(USER, { status: ['upcoming'] })
    })

    it('create and update return the saved race', async () => {
        mocks.createRace.mockReturnValue(Effect.succeed(RACE))
        mocks.updateRace.mockReturnValue(Effect.succeed(RACE))

        await expect(caller.races.create(INPUT)).resolves.toEqual(RACE)
        await expect(caller.races.update({ id: ID, race: INPUT })).resolves.toEqual(RACE)
        expect(mocks.updateRace).toHaveBeenCalledWith(USER, ID, INPUT)
    })

    it('complete, cancel and delete call their services with the id', async () => {
        mocks.completeRace.mockReturnValue(Effect.succeed(RACE))
        mocks.cancelRace.mockReturnValue(Effect.succeed(RACE))
        mocks.deleteRace.mockReturnValue(Effect.succeed({ id: ID }))

        await caller.races.complete({ id: ID, resultTimeS: 4100 })
        await caller.races.cancel({ id: ID })
        await caller.races.delete({ id: ID })

        expect(mocks.completeRace).toHaveBeenCalledWith(USER, ID, 4100)
        expect(mocks.cancelRace).toHaveBeenCalledWith(USER, ID)
        expect(mocks.deleteRace).toHaveBeenCalledWith(USER, ID)
    })

    it('restore calls its service with the id', async () => {
        mocks.restoreRace.mockReturnValue(Effect.succeed(RACE))

        await caller.races.restore({ id: ID })

        expect(mocks.restoreRace).toHaveBeenCalledWith(USER, ID)
    })

    it('rejects invalid ids and shapes with BAD_REQUEST before any service runs', async () => {
        const errors = await Promise.all([
            caught(caller.races.update({ id: 'nope', race: INPUT })),
            caught(caller.races.cancel({ id: 'nope' })),
            caught(caller.races.delete({ id: 'nope' })),
            caught(caller.races.complete({ id: ID, resultTimeS: 0 })),
            caught(caller.races.create({ ...INPUT, targetTimeS: 30 })),
            // SAFETY: deliberately invalid value, to prove the zod input rejects it.
            caught(caller.races.create({ ...INPUT, raceType: 'swim' as never })),
        ])

        expect(errors.map((error) => error.code)).toEqual(
            Array.from({ length: 6 }, () => 'BAD_REQUEST')
        )
        expect(mocks.createRace).not.toHaveBeenCalled()
        expect(mocks.updateRace).not.toHaveBeenCalled()
    })

    it('maps validation to BAD_REQUEST, not found to NOT_FOUND, state to CONFLICT, query to 500', async () => {
        mocks.createRace.mockReturnValue(failWith.validation())
        mocks.updateRace.mockReturnValue(failWith.notFound())
        mocks.completeRace.mockReturnValue(failWith.state())
        mocks.deleteRace.mockReturnValue(failWith.state())
        mocks.cancelRace.mockReturnValue(failWith.notFound())
        mocks.listRaces.mockReturnValue(failWith.query())

        const errors = await Promise.all([
            caught(caller.races.create(INPUT)),
            caught(caller.races.update({ id: ID, race: INPUT })),
            caught(caller.races.complete({ id: ID, resultTimeS: 4100 })),
            caught(caller.races.delete({ id: ID })),
            caught(caller.races.cancel({ id: ID })),
            caught(caller.races.list({})),
        ])

        expect(errors.map((error) => error.code)).toEqual([
            'BAD_REQUEST',
            'NOT_FOUND',
            'CONFLICT',
            'CONFLICT',
            'NOT_FOUND',
            'INTERNAL_SERVER_ERROR',
        ])
        expect(errors[5]?.cause).toBeUndefined()
    })
})
