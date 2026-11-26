import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { z } from 'zod'
import { VOICE_MAX_SECONDS } from '@/modules/coach/constants'

export type VoiceRecorderLike = {
    readonly mimeType: string
    start: () => void
    stop: () => void
    // Stops the microphone tracks, so the browser's recording indicator goes away.
    release: () => void
    onData: (listener: (chunk: Blob) => void) => void
    onStop: (listener: () => void) => void
}

export type VoiceDeps = {
    isSupported: () => boolean
    openRecorder: () => Promise<VoiceRecorderLike>
    transcribe: (audio: Blob, signal: AbortSignal) => Promise<Response>
}

export type VoiceState = 'idle' | 'recording' | 'transcribing'

export type VoiceErrorKind = 'mic-blocked' | 'no-speech' | 'busy' | 'failed'

type Options = { deps?: VoiceDeps; onTranscript: (text: string) => void }

type Session = {
    phase: 'starting' | VoiceState
    cancelled: boolean
    recorder: VoiceRecorderLike | null
    controller: AbortController | null
    timer: ReturnType<typeof setInterval> | null
    elapsed: number
}

type ClipResult = { ok: true; text: string } | { ok: false; error: VoiceErrorKind }

const TranscriptSchema = z.object({ text: z.string() })

const PermissionErrorSchema = z.object({ name: z.enum(['NotAllowedError', 'SecurityError']) })

const FAILED: ClipResult = { ok: false, error: 'failed' }

const subscribeToNothing = () => () => {}

const browserVoiceDeps: VoiceDeps = {
    // MediaRecorder exists only in browsers, and mediaDevices only on secure origins.
    isSupported: () => 'MediaRecorder' in globalThis && 'mediaDevices' in navigator,
    openRecorder: async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const release = () => stream.getTracks().forEach((track) => track.stop())
        let recorder: MediaRecorder
        try {
            recorder = new MediaRecorder(stream)
        } catch (error) {
            release()
            throw error
        }
        return {
            get mimeType() {
                return recorder.mimeType
            },
            start: () => recorder.start(),
            stop: () => {
                if (recorder.state !== 'inactive') recorder.stop()
            },
            release,
            onData: (listener) =>
                recorder.addEventListener('dataavailable', (event) => listener(event.data)),
            onStop: (listener) => recorder.addEventListener('stop', () => listener()),
        }
    },
    transcribe: (audio, signal) => {
        const body = new FormData()
        body.append('audio', audio, 'voice')
        return fetch('/api/coach/transcribe', { method: 'POST', body, signal })
    },
}

async function transcribeClip(
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

const clearTimer = (session: Session) => {
    if (session.timer !== null) clearInterval(session.timer)
    session.timer = null
}

// Each recording is a session object: a cancelled session keeps running its awaits, but every
// step checks `cancelled` first, so a late microphone or transcript never touches the state.
// oxlint-disable-next-line max-lines-per-function -- one hook owns the whole recording state machine
export function useVoiceRecorder({ deps = browserVoiceDeps, onTranscript }: Options) {
    const [state, setState] = useState<VoiceState>('idle')
    const [seconds, setSeconds] = useState(0)
    const [error, setError] = useState<VoiceErrorKind | null>(null)
    // False on the server and during hydration, so the button never causes a mismatch.
    const supported = useSyncExternalStore(subscribeToNothing, deps.isSupported, () => false)

    const sessionRef = useRef<Session | null>(null)
    const optionsRef = useRef({ deps, onTranscript })
    useEffect(() => {
        optionsRef.current = { deps, onTranscript }
    })

    const end = useCallback((session: Session, result: VoiceErrorKind | null) => {
        if (sessionRef.current === session) sessionRef.current = null
        setState('idle')
        setSeconds(0)
        setError(result)
    }, [])

    const finish = useCallback(
        async (session: Session, recorder: VoiceRecorderLike, chunks: Blob[]) => {
            if (session.phase !== 'recording') return
            session.phase = 'transcribing'
            clearTimer(session)
            recorder.release()
            if (session.cancelled) return
            const audio = new Blob(chunks, { type: recorder.mimeType })
            if (audio.size === 0) {
                end(session, 'no-speech')
                return
            }
            setState('transcribing')
            const controller = new AbortController()
            session.controller = controller
            const result = await transcribeClip(
                optionsRef.current.deps.transcribe,
                audio,
                controller.signal
            )
            if (session.cancelled) return
            if (result.ok) optionsRef.current.onTranscript(result.text)
            end(session, result.ok ? null : result.error)
        },
        [end]
    )

    const start = useCallback(async () => {
        const session: Session = {
            phase: 'starting',
            cancelled: false,
            recorder: null,
            controller: null,
            timer: null,
            elapsed: 0,
        }
        sessionRef.current = session
        setError(null)
        setSeconds(0)

        let recorder: VoiceRecorderLike
        try {
            recorder = await optionsRef.current.deps.openRecorder()
        } catch (openError) {
            if (session.cancelled) return
            end(
                session,
                PermissionErrorSchema.safeParse(openError).success ? 'mic-blocked' : 'failed'
            )
            return
        }
        if (session.cancelled) {
            recorder.release()
            return
        }

        const chunks: Blob[] = []
        session.recorder = recorder
        recorder.onData((chunk) => {
            if (chunk.size > 0) chunks.push(chunk)
        })
        recorder.onStop(() => void finish(session, recorder, chunks))
        recorder.start()
        session.phase = 'recording'
        setState('recording')
        session.timer = setInterval(() => {
            session.elapsed += 1
            setSeconds(session.elapsed)
            if (session.elapsed >= VOICE_MAX_SECONDS) recorder.stop()
        }, 1000)
    }, [end, finish])

    const toggle = useCallback(() => {
        const session = sessionRef.current
        if (session === null) {
            if (optionsRef.current.deps.isSupported()) void start()
            return
        }
        if (session.phase === 'recording') session.recorder?.stop()
    }, [start])

    const cancel = useCallback(() => {
        const session = sessionRef.current
        if (session === null) return
        session.cancelled = true
        clearTimer(session)
        session.recorder?.stop()
        session.recorder?.release()
        session.controller?.abort()
        end(session, null)
    }, [end])

    useEffect(() => cancel, [cancel])

    return { supported, state, seconds, error, toggle, cancel }
}
