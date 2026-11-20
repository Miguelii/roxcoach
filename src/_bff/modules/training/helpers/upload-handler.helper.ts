import 'server-only'

import type { User } from '@supabase/supabase-js'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'
import { Logger } from '@/_bff/lib/server-logger'

type UploadInput = { bytes: Uint8Array; originalName: string; isHyrox: boolean }

// A plain outcome: the wiring turns the Effect exit into this, so the handler never sees Effect.
// `errorHash` is the tagged error code, never the cause (which can hold file data).
type UploadOutcome =
    | { ok: true; activityId: string }
    | { ok: false; tag: string; errorHash?: string }

type UploadHandlerDeps = {
    getUser: () => Promise<User | null>
    upload: (user: User, input: UploadInput) => Promise<UploadOutcome>
}

const MAX_FILE_BYTES = 10 * 1024 * 1024

const INVALID_FILE = 'This file is not a valid FIT, TCX or GPX file'
const GENERIC = 'Something went wrong. Try again.'
const TOO_LARGE = 'The file is larger than 10 MB'

const ERROR_RESPONSES = new Map([
    ['UnsupportedActivityFileError', { status: 415, message: INVALID_FILE }],
    ['ActivityFileParseError', { status: 422, message: INVALID_FILE }],
    ['DuplicateActivityFileError', { status: 409, message: 'This file was already uploaded' }],
    ['ActivityFileTooLargeError', { status: 413, message: TOO_LARGE }],
])

const fail = (status: number, error: string) => Response.json({ error }, { status })

// Builds the POST handler. The route file only wires the real session lookup and service in, since
// a Next route file may export nothing but HTTP verbs. Error bodies are fixed strings: the file
// name and content never leave this function.
export const createUploadHandler =
    ({ getUser, upload }: UploadHandlerDeps) =>
    async (request: Request): Promise<Response> => {
        const user = await getUser()
        if (!user) return fail(401, 'Sign in to upload')
        if (!hasRoxcoachAccess(user)) return fail(403, 'You do not have access')

        const declared = Number(request.headers.get('content-length'))
        if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) return fail(413, TOO_LARGE)

        const form = await request.formData().catch(() => null)
        const file = form?.get('file')
        if (!(file instanceof File)) return fail(422, 'Choose a file to upload')
        if (file.size > MAX_FILE_BYTES) return fail(413, TOO_LARGE)

        try {
            const outcome = await upload(user, {
                bytes: new Uint8Array(await file.arrayBuffer()),
                originalName: file.name,
                isHyrox: form?.get('hyrox') === 'true',
            })
            if (outcome.ok) return Response.json({ activityId: outcome.activityId })

            Logger({
                level: 'error',
                prefix: 'uploadActivity',
                userId: user.id,
                metadata: { tag: outcome.tag, error_hash: outcome.errorHash },
            })
            const mapped = ERROR_RESPONSES.get(outcome.tag)
            return mapped ? fail(mapped.status, mapped.message) : fail(500, GENERIC)
        } catch {
            Logger({
                level: 'error',
                prefix: 'uploadActivity',
                userId: user.id,
                metadata: { tag: 'UploadDefect' },
            })
            return fail(500, GENERIC)
        }
    }
