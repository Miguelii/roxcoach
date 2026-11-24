/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { failureTag } from '@/_bff/lib/tests-utils'
import { makeFakeDb, ok } from '@/_bff/lib/fake-bd'
import {
    insertActivityFile,
    selectFileIdBySha256,
} from '@/_bff/modules/training/repositories/activity-files.repository'
import {
    putActivityFile,
    removeActivityFile,
} from '@/_bff/modules/training/repositories/activity-files-storage.repository'
import type { NewActivityFileRow, StorageClient } from '@/_bff/modules/training/types'

const USER_ID = 'user-1'
const ROW: NewActivityFileRow = {
    id: 'file-1',
    activity_id: 'act-1',
    format: 'fit',
    storage_path: 'user-1/file-1.fit',
    sha256: 'abc',
    size_bytes: 10,
    original_name: 'run.fit',
    status: 'parsed',
    error_code: null,
}

describe('insertActivityFile', () => {
    it('inserts the row with user_id', async () => {
        const { chains, from, supabase } = makeFakeDb([ok()])
        await Effect.runPromise(insertActivityFile(supabase, USER_ID, ROW))
        expect(from).toHaveBeenCalledWith('activity_files')
        expect(chains[0]?.insert).toHaveBeenCalledWith({ ...ROW, user_id: USER_ID })
    })

    it('maps the unique violation to DuplicateActivityFileError', async () => {
        const db = makeFakeDb([{ data: null, error: { code: '23505', message: 'duplicate key' } }])
        expect(
            failureTag(await Effect.runPromiseExit(insertActivityFile(db.supabase, USER_ID, ROW)))
        ).toBe('DuplicateActivityFileError')
    })

    it('tags a thrown error and another returned error as ActivityWriteError', async () => {
        const thrown = makeFakeDb([new Error('x')])
        const returned = makeFakeDb([{ data: null, error: { code: '42501', message: 'denied' } }])
        expect(
            failureTag(
                await Effect.runPromiseExit(insertActivityFile(thrown.supabase, USER_ID, ROW))
            )
        ).toBe('ActivityWriteError')
        expect(
            failureTag(
                await Effect.runPromiseExit(insertActivityFile(returned.supabase, USER_ID, ROW))
            )
        ).toBe('ActivityWriteError')
    })

    it('never puts the original name in a returned error cause', async () => {
        const db = makeFakeDb([
            { data: null, error: { code: '42501', message: 'denied', details: ROW.original_name } },
        ])
        const exit = await Effect.runPromiseExit(insertActivityFile(db.supabase, USER_ID, ROW))
        expect(failureTag(exit)).toBe('ActivityWriteError')
        expect(JSON.stringify(exit)).not.toContain('run.fit')
    })
})

describe('selectFileIdBySha256', () => {
    it('filters by user and hash', async () => {
        const { chains, supabase } = makeFakeDb([ok({ id: 'f1' })])
        expect(await Effect.runPromise(selectFileIdBySha256(supabase, USER_ID, 'abc'))).toBe('f1')
        expect(chains[0]?.eq).toHaveBeenCalledWith('user_id', USER_ID)
        expect(chains[0]?.eq).toHaveBeenCalledWith('sha256', 'abc')
    })

    it('tags thrown and returned errors', async () => {
        const thrown = makeFakeDb([new Error('x')])
        const returned = makeFakeDb([{ data: null, error: { code: '1', message: 'm' } }])
        expect(
            failureTag(
                await Effect.runPromiseExit(selectFileIdBySha256(thrown.supabase, USER_ID, 'a'))
            )
        ).toBe('ActivityQueryError')
        expect(
            failureTag(
                await Effect.runPromiseExit(selectFileIdBySha256(returned.supabase, USER_ID, 'a'))
            )
        ).toBe('ActivityQueryError')
    })
})

const makeStorage = (result: { error: { message: string } | null } | Error) => {
    const settle = () =>
        result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    const upload = vi.fn(settle)
    const remove = vi.fn(settle)
    const from = vi.fn(() => ({ upload, remove }))
    const client: StorageClient = { storage: { from } }
    return { client, from, upload, remove }
}

describe('putActivityFile', () => {
    it('uploads to the activity-files bucket without upsert', async () => {
        const { client, from, upload } = makeStorage({ error: null })
        const bytes = new Uint8Array([1, 2])
        await Effect.runPromise(
            putActivityFile(client, 'user-1/f.fit', bytes, 'application/octet-stream')
        )
        expect(from).toHaveBeenCalledWith('activity-files')
        expect(upload).toHaveBeenCalledWith('user-1/f.fit', bytes, {
            contentType: 'application/octet-stream',
            upsert: false,
        })
    })

    it('tags thrown and returned errors', async () => {
        const thrown = makeStorage(new Error('x'))
        const returned = makeStorage({ error: { message: 'bad' } })
        const run = (c: StorageClient) =>
            Effect.runPromiseExit(putActivityFile(c, 'p', new Uint8Array(), 't'))
        expect(failureTag(await run(thrown.client))).toBe('ActivityFileStorageError')
        expect(failureTag(await run(returned.client))).toBe('ActivityFileStorageError')
    })
})

describe('removeActivityFile', () => {
    it('removes the path from the bucket', async () => {
        const { client, from, remove } = makeStorage({ error: null })
        await Effect.runPromise(removeActivityFile(client, 'user-1/f.fit'))
        expect(from).toHaveBeenCalledWith('activity-files')
        expect(remove).toHaveBeenCalledWith(['user-1/f.fit'])
    })

    it('tags thrown and returned errors', async () => {
        const thrown = makeStorage(new Error('x'))
        const returned = makeStorage({ error: { message: 'bad' } })
        const run = (c: StorageClient) => Effect.runPromiseExit(removeActivityFile(c, 'p'))
        expect(failureTag(await run(thrown.client))).toBe('ActivityFileStorageError')
        expect(failureTag(await run(returned.client))).toBe('ActivityFileStorageError')
    })
})
