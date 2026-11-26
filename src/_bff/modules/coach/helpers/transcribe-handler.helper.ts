import 'server-only'

import type { User } from '@supabase/supabase-js'
import { hasRoxcoachAccess } from '@/_bff/core/helpers/access.helper'
import { Logger } from '@/_bff/lib/server-logger'
import { AUDIO_MAX_BYTES, AUDIO_MIME_TYPES } from '@/_bff/modules/coach/constants'
import type { Transcriber } from '@/_bff/modules/coach/providers/transcriber'

type TranscribeHandlerDeps = {
    getUser: () => Promise<User | null>
    // False when the Gemini key is not configured: the handler answers 503.
    isConfigured: boolean
    transcribe: Transcriber
}

// Multipart framing around the clip, allowed on the content-length check only.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

const GENERIC = 'Something went wrong. Try again.'
const TOO_LONG = 'The recording is too long'

const ALLOWED_TYPES: ReadonlySet<string> = new Set(AUDIO_MIME_TYPES)

const fail = (status: number, error: string) => Response.json({ error }, { status })

// Browsers add codec parameters (`audio/webm;codecs=opus`), so only the container is compared.
const baseType = (mimeType: string) => mimeType.split(';')[0]?.trim().toLowerCase() ?? ''

// Builds the POST handler (the route file only wires the real session and transcriber in). Error
// bodies are fixed strings: the audio and the transcript never reach a log.
export const createTranscribeHandler =
    ({ getUser, isConfigured, transcribe }: TranscribeHandlerDeps) =>
    async (request: Request): Promise<Response> => {
        let user: User | null
        try {
            user = await getUser()
        } catch {
            Logger({
                level: 'error',
                prefix: 'coachTranscribe',
                metadata: { tag: 'SessionFailure' },
            })
            return fail(500, GENERIC)
        }
        if (!user) return fail(401, 'Sign in to use voice input')
        if (!hasRoxcoachAccess(user)) return fail(403, 'You do not have access')
        if (!isConfigured) return fail(503, 'Voice input is not available right now')

        // Without a valid content-length the body could be unbounded, so it is rejected unread.
        const header = request.headers.get('content-length')
        const declared = header === null || header.trim() === '' ? Number.NaN : Number(header)
        if (!Number.isFinite(declared) || declared > AUDIO_MAX_BYTES + MULTIPART_OVERHEAD_BYTES)
            return fail(413, TOO_LONG)

        const form = await request.formData().catch(() => null)
        const audio = form?.get('audio')
        if (!(audio instanceof File) || audio.size === 0) return fail(422, 'Record something first')
        if (audio.size > AUDIO_MAX_BYTES) return fail(413, TOO_LONG)
        if (!ALLOWED_TYPES.has(baseType(audio.type)))
            return fail(415, 'This recording format is not supported')

        try {
            const outcome = await transcribe(
                { bytes: new Uint8Array(await audio.arrayBuffer()), mimeType: audio.type },
                request.signal
            )
            if (outcome.ok) return Response.json({ text: outcome.text })
            Logger({
                level: 'warn',
                prefix: 'coachTranscribe',
                userId: user.id,
                metadata: { tag: outcome.kind },
            })
            return outcome.kind === 'rate_limited'
                ? fail(429, 'Transcription is busy. Try again in a minute.')
                : fail(502, "Couldn't transcribe. Try again.")
        } catch {
            Logger({
                level: 'error',
                prefix: 'coachTranscribe',
                userId: user.id,
                metadata: { tag: 'TranscribeDefect' },
            })
            return fail(500, GENERIC)
        }
    }
