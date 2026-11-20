// @vitest-environment node
import type { User } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createUploadHandler } from '@/_bff/modules/training/helpers/upload-handler.helper'

type UploadOutcome = Awaited<ReturnType<Parameters<typeof createUploadHandler>[0]['upload']>>

const makeUser = (id: string, appMetadata: User['app_metadata']): User => ({
    id,
    app_metadata: appMetadata,
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
})

const ACCESS_USER = makeUser('user-1', { roxcoach: true })
const NO_FLAG_USER = makeUser('user-2', { roxcoach: 'true' })

const setup = (user: User | null, outcome: UploadOutcome | Error) => {
    const upload = vi.fn(async () => {
        if (outcome instanceof Error) throw outcome
        return outcome
    })
    const handler = createUploadHandler({ getUser: async () => user, upload })
    return { upload, handler }
}

const request = (fields: Record<string, string | File>, headers: Record<string, string> = {}) => {
    const body = new FormData()
    for (const [key, value] of Object.entries(fields)) body.set(key, value)
    return new Request('http://localhost/api/activities/upload', {
        method: 'POST',
        body,
        headers,
    })
}

const file = () => new File([new Uint8Array([1, 2, 3])], 'secret-name.fit')

describe('createUploadHandler', () => {
    it('returns 401 and calls nothing without a user', async () => {
        const { handler, upload } = setup(null, { ok: true, activityId: 'a' })
        const response = await handler(request({ file: file() }))
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: 'Sign in to upload' })
        expect(upload).not.toHaveBeenCalled()
    })

    it('returns 403 and calls nothing without the strict access flag', async () => {
        const { handler, upload } = setup(NO_FLAG_USER, { ok: true, activityId: 'a' })
        const response = await handler(request({ file: file() }))
        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'You do not have access' })
        expect(upload).not.toHaveBeenCalled()
    })

    it('returns 422 when the file field is missing', async () => {
        const { handler, upload } = setup(ACCESS_USER, { ok: true, activityId: 'a' })
        const response = await handler(request({ hyrox: 'true' }))
        expect(response.status).toBe(422)
        expect(await response.json()).toEqual({ error: 'Choose a file to upload' })
        expect(upload).not.toHaveBeenCalled()
    })

    it('returns 422 when the file field is a plain string', async () => {
        const { handler } = setup(ACCESS_USER, { ok: true, activityId: 'a' })
        const response = await handler(request({ file: 'text' }))
        expect(response.status).toBe(422)
    })

    it.each([
        ['UnsupportedActivityFileError', 415, 'This file is not a valid FIT, TCX or GPX file'],
        ['ActivityFileParseError', 422, 'This file is not a valid FIT, TCX or GPX file'],
        ['DuplicateActivityFileError', 409, 'This file was already uploaded'],
        ['ActivityFileTooLargeError', 413, 'The file is larger than 10 MB'],
        ['ActivityFileStorageError', 500, 'Something went wrong. Try again.'],
        ['ActivityWriteError', 500, 'Something went wrong. Try again.'],
    ])('maps %s to %i', async (tag, status, message) => {
        const { handler } = setup(ACCESS_USER, { ok: false, tag, errorHash: 'X' })
        const response = await handler(request({ file: file() }))
        expect(response.status).toBe(status)
        const text = await response.text()
        expect(JSON.parse(text)).toEqual({ error: message })
        expect(text).not.toContain('secret-name')
    })

    it('returns 413 from content-length without reading the body', async () => {
        const { handler, upload } = setup(ACCESS_USER, { ok: true, activityId: 'a' })
        const req = request({ file: file() }, { 'content-length': String(11 * 1024 * 1024) })
        const formData = vi.spyOn(req, 'formData')
        const response = await handler(req)
        expect(response.status).toBe(413)
        expect(await response.json()).toEqual({ error: 'The file is larger than 10 MB' })
        expect(formData).not.toHaveBeenCalled()
        expect(upload).not.toHaveBeenCalled()
    })

    it('returns 413 when the file itself is over the limit', async () => {
        const { handler, upload } = setup(ACCESS_USER, { ok: true, activityId: 'a' })
        const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.fit')
        const response = await handler(request({ file: big }))
        expect(response.status).toBe(413)
        expect(upload).not.toHaveBeenCalled()
    })

    it('returns the activity id and passes isHyrox and the bytes', async () => {
        const { handler, upload } = setup(ACCESS_USER, { ok: true, activityId: 'act-9' })
        const response = await handler(request({ file: file(), hyrox: 'true' }))
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ activityId: 'act-9' })
        expect(upload).toHaveBeenCalledWith(ACCESS_USER, {
            bytes: new Uint8Array([1, 2, 3]),
            originalName: 'secret-name.fit',
            isHyrox: true,
        })
    })

    it('defaults isHyrox to false', async () => {
        const { handler, upload } = setup(ACCESS_USER, { ok: true, activityId: 'a' })
        await handler(request({ file: file(), hyrox: 'yes' }))
        expect(upload).toHaveBeenCalledWith(
            ACCESS_USER,
            expect.objectContaining({ isHyrox: false })
        )
    })

    it('returns a generic 500 when upload throws', async () => {
        const { handler } = setup(ACCESS_USER, new Error('boom secret-name'))
        const response = await handler(request({ file: file() }))
        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({ error: 'Something went wrong. Try again.' })
    })
})
