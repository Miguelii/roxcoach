import { z } from 'zod'
import { TRANSCRIBE_MODEL_ID } from '@/_bff/modules/coach/constants'
import type { Transcriber, TranscribeOutcome } from '@/_bff/modules/coach/providers/transcriber'

type Options = { apiKey: string; timeoutMs: number; fetch?: typeof fetch }

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'

const UNAVAILABLE: TranscribeOutcome = { ok: false, kind: 'unavailable' }

// Gemini lists Safari's mp4 audio container as audio/m4a and rejects audio/mp4.
const GEMINI_MIME_ALIASES = new Map([['audio/mp4', 'audio/m4a']])

const InteractionSchema = z.looseObject({
    status: z.string(),
    steps: z
        .array(
            z.looseObject({
                content: z
                    .array(z.looseObject({ type: z.string(), text: z.string().optional() }))
                    .optional(),
            })
        )
        .optional(),
})

const toGeminiMimeType = (mimeType: string) => {
    const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
    return GEMINI_MIME_ALIASES.get(base) ?? base
}

const transcriptOf = (steps: z.infer<typeof InteractionSchema>['steps']) =>
    (steps ?? [])
        .flatMap((step) => step.content ?? [])
        .flatMap((part) => (part.type === 'text' && part.text ? [part.text.trim()] : []))
        .filter((text) => text !== '')
        .join(' ')

// Calls the Interactions API directly: the AI SDK only speaks generateContent, which this model
// does not document.
export const createGeminiTranscriber =
    ({ apiKey, timeoutMs, fetch: doFetch = fetch }: Options): Transcriber =>
    async ({ bytes, mimeType }, signal) => {
        const timeout = new AbortController()
        const timer = setTimeout(() => timeout.abort(), timeoutMs)
        try {
            const response = await doFetch(ENDPOINT, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify({
                    model: TRANSCRIBE_MODEL_ID,
                    input: [
                        {
                            type: 'audio',
                            data: Buffer.from(bytes).toString('base64'),
                            mime_type: toGeminiMimeType(mimeType),
                        },
                    ],
                    generation_config: { transcription_config: { mode: 'smart' } },
                }),
                signal: AbortSignal.any([signal, timeout.signal]),
            })
            if (response.status === 429) return { ok: false, kind: 'rate_limited' }
            if (!response.ok) return UNAVAILABLE
            const parsed = InteractionSchema.safeParse(await response.json())
            if (!parsed.success || parsed.data.status === 'failed') return UNAVAILABLE
            return { ok: true, text: transcriptOf(parsed.data.steps) }
        } catch {
            return UNAVAILABLE
        } finally {
            clearTimeout(timer)
        }
    }
