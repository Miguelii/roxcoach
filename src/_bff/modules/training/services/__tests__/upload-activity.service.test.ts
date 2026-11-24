// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { z } from 'zod'
import type { User } from '@supabase/supabase-js'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import { uploadActivity } from '@/_bff/modules/training/services/upload-activity.service'
import type { StorageClient } from '@/_bff/modules/training/types'

// SAFETY: the service only reads `user.id`.
const USER = { id: 'user-1' } as User
const FIXTURES = new URL('../../helpers/__tests__/fixtures/', import.meta.url)
const TCX = new Uint8Array(readFileSync(new URL('zepp-hyrox-test.tcx', FIXTURES)))
const GPX = (time: string) =>
    new TextEncoder().encode(
        `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="0" lon="0"><time>${time}</time></trkpt></trkseg></trk></gpx>`
    )

const sixteenLapTcx = () => {
    const laps = Array.from(
        { length: 16 },
        (_, index) =>
            `<Lap StartTime="2026-11-20T12:${String(index).padStart(2, '0')}:00Z"><TotalTimeSeconds>60</TotalTimeSeconds></Lap>`
    ).join('')
    return new TextEncoder().encode(
        `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Other"><Id>2026-11-20T12:00:00Z</Id>${laps}</Activity></Activities></TrainingCenterDatabase>`
    )
}

type Chain = ReturnType<typeof makeFakeDb>['chains'][number]

const lapsSchema = z.array(z.object({ station: z.string().nullable() }))
const activitySchema = z.object({
    source: z.string(),
    user_id: z.string(),
    category: z.string(),
    local_date: z.string(),
    hr_histogram: z.object({ v: z.literal(1), bins: z.array(z.unknown()) }),
    pace_histogram: z.object({ v: z.literal(1), bins: z.array(z.unknown()) }),
})

// Parses the first argument the chain's insert received.
const insertedActivity = (chain: Chain | undefined) => {
    const calls: unknown[][] = chain?.insert.mock.calls ?? []
    return activitySchema.parse(calls[0]?.[0])
}

const insertedLapStations = (chain: Chain | undefined) => {
    const calls: unknown[][] = chain?.insert.mock.calls ?? []
    return lapsSchema.parse(calls[0]?.[0]).map((lap) => lap.station)
}

const violation = { code: '23505', message: 'duplicate key' }

const setup = (queue: Parameters<typeof makeFakeDb>[0], timezone = 'Europe/Lisbon') => {
    const db = makeFakeDb(queue)
    const upload = vi.fn(() => Promise.resolve({ error: null }))
    const remove = vi.fn(() => Promise.resolve({ error: null }))
    const storage: StorageClient = { storage: { from: () => ({ upload, remove }) } }
    const deps = {
        getTimezone: () => Effect.succeed(timezone),
        createClient: () => Effect.succeed({ supabase: db.supabase, storage }),
    }
    const run = (bytes: Uint8Array, isHyrox = false) =>
        Effect.runPromiseExit(
            uploadActivity(USER, { bytes, originalName: 'secret-name.tcx', isHyrox }, deps)
        )
    return { db, upload, remove, run, deps }
}

// Calls in order: hash lookup, start lookup, activity insert, laps insert, file insert (the last
// two run together).
const HAPPY = [ok(), ok(), ok({ id: 'act-1' }), ok(), ok()]

describe('uploadActivity', () => {
    it('writes the object, the activity, the laps and the file row, labelling Hyrox laps', async () => {
        const { db, upload, run } = setup(HAPPY)

        const exit = await run(sixteenLapTcx(), true)

        expect(failureTag(exit)).toBeNull()
        expect(JSON.stringify(exit)).toContain('act-1')
        const tables = db.from.mock.calls.map(([table]) => table)
        expect(tables).toEqual([
            'activity_files',
            'activities',
            'activities',
            'activity_laps',
            'activity_files',
        ])
        expect(insertedActivity(db.chains[2])).toMatchObject({
            source: 'manual',
            user_id: 'user-1',
            category: 'hyrox',
            hr_histogram: { v: 1, bins: [] },
            pace_histogram: { v: 1, bins: [] },
        })
        const stations = insertedLapStations(db.chains[3])
        expect(stations).toHaveLength(16)
        expect(stations.filter((station) => station !== null)).toHaveLength(8)
        const calls: unknown[][] = upload.mock.calls
        const path = String(calls[0]?.[0])
        expect(path).toMatch(/^user-1\/[0-9a-f-]{36}\.tcx$/u)
        expect(path).not.toContain('secret-name')
    })

    it('leaves laps unlabelled when the file is not marked as Hyrox', async () => {
        const { db, run } = setup(HAPPY)
        await run(sixteenLapTcx(), false)
        const stations = insertedLapStations(db.chains[3])
        expect(stations).toHaveLength(16)
        expect(stations.every((station) => station === null)).toBe(true)
    })

    it('rejects a file over 10 MB before parsing or touching anything', async () => {
        const { db, upload, run } = setup(HAPPY)
        const exit = await run(new Uint8Array(10 * 1024 * 1024 + 1))
        expect(failureTag(exit)).toBe('ActivityFileTooLargeError')
        expect(db.from).not.toHaveBeenCalled()
        expect(upload).not.toHaveBeenCalled()
    })

    it('stores nothing when the file does not parse', async () => {
        const { db, upload, run } = setup(HAPPY)
        const exit = await run(new TextEncoder().encode('hello there'))
        expect(failureTag(exit)).toBe('UnsupportedActivityFileError')
        expect(db.from).not.toHaveBeenCalled()
        expect(upload).not.toHaveBeenCalled()
    })

    it('rejects the same bytes twice with no second object', async () => {
        const { upload, run } = setup([ok({ id: 'f1' })])
        const exit = await run(TCX)
        expect(failureTag(exit)).toBe('DuplicateActivityFileError')
        expect(upload).not.toHaveBeenCalled()
    })

    it('rejects another format with the same startedAt as a duplicate', async () => {
        const { upload, run } = setup([ok(), ok({ id: 'act-0' })])
        const exit = await run(GPX('2026-11-20T10:00:00Z'))
        expect(failureTag(exit)).toBe('DuplicateActivityFileError')
        expect(upload).not.toHaveBeenCalled()
    })

    it('looks for an activity within five minutes of the start, so a run synced from Zepp counts', async () => {
        const { db, run } = setup([ok(), ok({ id: 'zepp-run' })])
        await run(GPX('2026-11-20T10:00:00Z'))
        expect(db.chains[1]?.gte).toHaveBeenCalledWith('started_at', '2026-11-20T09:55:00.000Z')
        expect(db.chains[1]?.lte).toHaveBeenCalledWith('started_at', '2026-11-20T10:05:00.000Z')
        expect(db.chains[1]?.neq).not.toHaveBeenCalled()
    })

    it('maps a unique violation on the file insert to the duplicate error and rolls back', async () => {
        const { db, remove, run } = setup([
            ok(),
            ok(),
            ok({ id: 'act-1' }),
            ok(),
            { data: null, error: violation },
            ok(),
        ])
        const exit = await run(TCX)
        expect(failureTag(exit)).toBe('DuplicateActivityFileError')
        expect(remove).toHaveBeenCalledTimes(1)
        expect(db.chains[5]?.delete).toHaveBeenCalled()
        expect(db.chains[5]?.eq).toHaveBeenCalledWith('id', 'act-1')
    })

    it('removes the object and the activity when a database step fails, keeping the original error', async () => {
        const { db, remove, run } = setup([
            ok(),
            ok(),
            ok({ id: 'act-1' }),
            { data: null, error: { code: '42501', message: 'denied' } },
            ok(),
            ok(),
        ])
        const exit = await run(TCX)
        expect(failureTag(exit)).toBe('ActivityWriteError')
        expect(remove).toHaveBeenCalledTimes(1)
        expect(db.chains[5]?.delete).toHaveBeenCalled()
    })

    it('removes the object when the activity insert fails, even if the cleanup fails too', async () => {
        const { remove, run } = setup([
            ok(),
            ok(),
            { data: null, error: { code: '42501', message: 'denied' } },
        ])
        remove.mockRejectedValue(new Error('storage down'))
        const exit = await run(TCX)
        expect(failureTag(exit)).toBe('ActivityWriteError')
        expect(remove).toHaveBeenCalledTimes(1)
    })

    it('rolls back when a step dies with a defect', async () => {
        const defect = {
            data: null,
            get error(): never {
                throw new Error('defect')
            },
        }
        const { db, remove, run } = setup([ok(), ok(), ok({ id: 'act-1' }), defect, ok(), ok()])
        const exit = await run(TCX)
        expect(failureTag(exit)).toBeNull()
        expect(exit._tag).toBe('Failure')
        expect(remove).toHaveBeenCalledTimes(1)
        expect(db.chains[5]?.delete).toHaveBeenCalled()
    })

    it('keeps the local date in Lisbon winter and moves it forward in Tokyo', async () => {
        const instant = '2026-11-20T23:30:00Z'
        const lisbon = setup(HAPPY, 'Europe/Lisbon')
        const tokyo = setup(HAPPY, 'Asia/Tokyo')
        await lisbon.run(GPX(instant))
        await tokyo.run(GPX(instant))
        expect(insertedActivity(lisbon.db.chains[2]).local_date).toBe('2026-11-20')
        expect(insertedActivity(tokyo.db.chains[2]).local_date).toBe('2026-11-21')
    })
})
