/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import {
    selectBackfillTargets,
    updateHistograms,
} from '@/_bff/modules/training/repositories/activities.repository'
import { getActivityFile } from '@/_bff/modules/training/repositories/activity-files-storage.repository'
import type { HrHistogram, PaceHistogram } from '@/_bff/modules/training/types/progress'
import type { StorageReadClient } from '@/_bff/modules/training/types'

const USER_ID = 'user-1'

// SAFETY: the fake only carries rows through; an embedded relation is not a flat FakeRow.
const okRows = (rows: unknown[]) => ok(rows as never)
const HR: HrHistogram = { v: 1, bins: [[150, 10, 30]] }
const PACE: PaceHistogram = { v: 1, bins: [[250, 10, 40]] }
const HISTOGRAMS = { hrHistogram: HR, paceHistogram: PACE }

describe('selectBackfillTargets', () => {
    it('selects the user rows missing the HR or the pace histogram that have a parsed file', async () => {
        const { chains, from, supabase } = makeFakeDb([
            okRows([
                { id: 'a1', activity_files: [{ storage_path: 'user-1/f1.fit' }] },
                { id: 'a2', activity_files: [{ storage_path: 'user-1/f2.tcx' }] },
            ]),
        ])
        const targets = await Effect.runPromise(selectBackfillTargets(supabase, USER_ID))

        expect(from).toHaveBeenCalledWith('activities')
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.or).toHaveBeenCalledWith('hr_histogram.is.null,pace_histogram.is.null')
        expect(chains[0]?.is).toHaveBeenCalledWith('deleted_at', null)
        expect(chains[0]?.eq).toHaveBeenCalledWith('activity_files.status', 'parsed')
        expect(targets).toEqual([
            { activityId: 'a1', storagePath: 'user-1/f1.fit' },
            { activityId: 'a2', storagePath: 'user-1/f2.tcx' },
        ])
    })

    it('tags thrown, returned and malformed results as ActivityQueryError', async () => {
        const run = (queue: Parameters<typeof makeFakeDb>[0]) =>
            Effect.runPromiseExit(selectBackfillTargets(makeFakeDb(queue).supabase, USER_ID))
        expect(failureTag(await run([new Error('x')]))).toBe('ActivityQueryError')
        expect(
            failureTag(await run([{ data: null, error: { code: '42501', message: 'denied' } }]))
        ).toBe('ActivityQueryError')
        expect(failureTag(await run([okRows([{ nope: 1 }])]))).toBe('ActivityQueryError')
    })
})

describe('updateHistograms', () => {
    it('updates only the histograms of the user row', async () => {
        const { chains, from, supabase } = makeFakeDb([ok()])
        await Effect.runPromise(updateHistograms(supabase, USER_ID, 'a1', HISTOGRAMS))

        expect(from).toHaveBeenCalledWith('activities')
        expect(chains[0]?.update).toHaveBeenCalledWith({
            hr_histogram: HR,
            pace_histogram: PACE,
        })
        expect(chains[0]?.eq).toHaveBeenCalledWith('id', 'a1')
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
    })

    it('tags thrown and returned errors as ActivityWriteError', async () => {
        const run = (queue: Parameters<typeof makeFakeDb>[0]) =>
            Effect.runPromiseExit(
                updateHistograms(makeFakeDb(queue).supabase, USER_ID, 'a1', HISTOGRAMS)
            )
        expect(failureTag(await run([new Error('x')]))).toBe('ActivityWriteError')
        expect(
            failureTag(await run([{ data: null, error: { code: '42501', message: 'denied' } }]))
        ).toBe('ActivityWriteError')
    })
})

const makeReadStorage = (
    result: { data: Blob | null; error: { message: string } | null } | Error
) => {
    const download = vi.fn(() =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    )
    const from = vi.fn(() => ({ download }))
    const client: StorageReadClient = { storage: { from } }
    return { client, from, download }
}

describe('getActivityFile', () => {
    it('downloads the object from the activity-files bucket as bytes', async () => {
        const { client, from, download } = makeReadStorage({
            data: new Blob([new Uint8Array([1, 2, 3])]),
            error: null,
        })
        const bytes = await Effect.runPromise(getActivityFile(client, 'user-1/f.fit'))

        expect(from).toHaveBeenCalledWith('activity-files')
        expect(download).toHaveBeenCalledWith('user-1/f.fit')
        expect(Array.from(bytes)).toEqual([1, 2, 3])
    })

    it('tags thrown errors, returned errors and a missing body', async () => {
        const run = (c: StorageReadClient) => Effect.runPromiseExit(getActivityFile(c, 'p'))
        expect(failureTag(await run(makeReadStorage(new Error('x')).client))).toBe(
            'ActivityFileStorageError'
        )
        expect(
            failureTag(await run(makeReadStorage({ data: null, error: { message: 'bad' } }).client))
        ).toBe('ActivityFileStorageError')
        expect(failureTag(await run(makeReadStorage({ data: null, error: null }).client))).toBe(
            'ActivityFileStorageError'
        )
    })
})
