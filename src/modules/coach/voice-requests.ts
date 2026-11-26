import { z } from 'zod'
import type { VoiceDeps, VoiceErrorKind } from '@/modules/coach/use-voice-recorder'

type ClipResult = { ok: true; text: string } | { ok: false; error: VoiceErrorKind }

const TokenSchema = z.object({ token: z.string().min(1) })
const TranscriptSchema = z.object({ text: z.string() })
const FAILED: ClipResult = { ok: false, error: 'failed' }

export async function fetchLiveToken(
    fetchToken: VoiceDeps['fetchToken'],
    signal: AbortSignal
): Promise<string | null> {
    try {
        const response = await fetchToken(signal)
        if (!response.ok) return null
        const parsed = TokenSchema.safeParse(await response.json())
        return parsed.success ? parsed.data.token : null
    } catch {
        return null
    }
}

export async function transcribeClip(
    transcribe: VoiceDeps['transcribe'],
    audio: Blob,
    signal: AbortSignal
): Promise<ClipResult> {
    try {
        const response = await transcribe(audio, signal)
        if (response.status === 429) return { ok: false, error: 'busy' }
        if (!response.ok) return FAILED
        const parsed = TranscriptSchema.safeParse(await response.json())
        if (!parsed.success) return FAILED
        const text = parsed.data.text.trim()
        return text === '' ? { ok: false, error: 'no-speech' } : { ok: true, text }
    } catch {
        return FAILED
    }
}
