import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { ErrorCode } from '@/_bff/lib/error-codes'
import { asClient } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import { backfillHistograms } from '@/_bff/modules/training/services/backfill-histograms.service'
import type { StorageReadClient, TrainingClient } from '@/_bff/modules/training/types'

const USER_ID = 'user-1'

const point = (second: number, hr: number | null, distance: number) => `
    <Trackpoint>
        <Time>2026-11-08T17:00:0${second}Z</Time>
        ${hr === null ? '' : `<HeartRateBpm><Value>${hr}</Value></HeartRateBpm>`}
        <DistanceMeters>${distance}</DistanceMeters>
    </Trackpoint>`

const tcx = (hr: number | null) =>
    new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>x</Id>
    <Lap StartTime="2026-11-08T17:00:00Z"><TotalTimeSeconds>3</TotalTimeSeconds>
    <DistanceMeters>9</DistanceMeters><Track>
        ${point(0, hr, 0)}${point(1, hr, 3)}${point(2, hr, 6)}${point(3, hr, 9)}
    </Track></Lap></Activity></Activities></TrainingCenterDatabase>`)

type Files = Record<string, Uint8Array | Error>

const makeClient = (queue: Parameters<typeof makeFakeDb>[0], files: Files) => {
    const db = makeFakeDb(queue)
    const download = vi.fn(async (path: string) => {
        const file = files[path]
        if (file instanceof Error) throw file
        return { data: file === undefined ? null : new Blob([new Uint8Array(file)]), error: null }
    })
    const storage: StorageReadClient = { storage: { from: () => ({ download }) } }
    // SAFETY: the service only uses the from() and storage parts the fakes implement.
    const client = { ...asClient({ from: db.from }), ...storage } as TrainingClient &
        StorageReadClient
    return { client, db, download }
}

// SAFETY: the fake only carries rows through; an embedded relation is not a flat FakeRow.
const targets = (...ids: string[]) =>
    ok(ids.map((id) => ({ id, activity_files: [{ storage_path: `user-1/${id}.tcx` }] })) as never)

describe('backfillHistograms', () => {
    it('writes the parsed histogram of every target', async () => {
        const { client, db } = makeClient([targets('a1', 'a2'), ok()], {
            'user-1/a1.tcx': tcx(150),
            'user-1/a2.tcx': tcx(160),
        })
        const result = await Effect.runPromise(backfillHistograms(client, USER_ID))

        expect(result).toEqual({ updated: 2, failed: 0, failures: [] })
        expect(db.chains[1]?.update).toHaveBeenCalledWith({
            hr_histogram: { v: 1, bins: [[150, 3, 9]] },
            pace_histogram: { v: 1, bins: [[330, 3, 9]] },
        })
        expect(db.chains[2]?.update).toHaveBeenCalledWith({
            hr_histogram: { v: 1, bins: [[160, 3, 9]] },
            pace_histogram: { v: 1, bins: [[330, 3, 9]] },
        })
    })

    it('writes an empty HR histogram and still a pace histogram for a file without heart rate and counts it as updated', async () => {
        const { client, db } = makeClient([targets('a1'), ok()], { 'user-1/a1.tcx': tcx(null) })
        const result = await Effect.runPromise(backfillHistograms(client, USER_ID))

        expect(result.updated).toBe(1)
        expect(db.chains[1]?.update).toHaveBeenCalledWith({
            hr_histogram: { v: 1, bins: [] },
            pace_histogram: { v: 1, bins: [[330, 3, 9]] },
        })
    })

    it('counts parse and download failures, records only id and code, and keeps going', async () => {
        const { client } = makeClient([targets('a1', 'a2', 'a3'), ok()], {
            'user-1/a1.tcx': new TextEncoder().encode('not a training file'),
            'user-1/a2.tcx': new Error('network down'),
            'user-1/a3.tcx': tcx(150),
        })
        const result = await Effect.runPromise(backfillHistograms(client, USER_ID))

        expect(result.updated).toBe(1)
        expect(result.failed).toBe(2)
        expect(result.failures.map((failure) => failure.activityId)).toEqual(['a1', 'a2'])
        expect(result.failures[1]?.errorCode).toBe(ErrorCode.TRAINING_FILE_STORAGE_GET)
        expect(Object.keys(result.failures[0] ?? {}).toSorted()).toEqual([
            'activityId',
            'errorCode',
        ])
        expect(JSON.stringify(result)).not.toContain('user-1/')
    })

    it('counts a failed update and keeps going', async () => {
        const { client } = makeClient(
            [
                targets('a1', 'a2'),
                { data: null, error: { code: '42501', message: 'denied' } },
                ok(),
            ],
            { 'user-1/a1.tcx': tcx(150), 'user-1/a2.tcx': tcx(150) }
        )
        const result = await Effect.runPromise(backfillHistograms(client, USER_ID))

        expect(result).toMatchObject({ updated: 1, failed: 1 })
        expect(result.failures[0]).toEqual({
            activityId: 'a1',
            errorCode: ErrorCode.TRAINING_HR_HISTOGRAM_UPDATE_ERR,
        })
    })

    it('does nothing when no target is left', async () => {
        const { client } = makeClient([ok([])], {})
        expect(await Effect.runPromise(backfillHistograms(client, USER_ID))).toEqual({
            updated: 0,
            failed: 0,
            failures: [],
        })
    })
})
