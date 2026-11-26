import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { z } from 'zod'
import { VOICE_MAX_SECONDS } from '@/modules/coach/constants'
import {
    openLiveSession,
    type LiveSession,
    type LiveSocket,
} from '@/modules/coach/live-transcription'
import { createChunker, downsample, encodeWav, toPcm16 } from '@/modules/coach/pcm-audio'
import { browserVoiceDeps } from '@/modules/coach/browser-voice-deps'

export type AudioSource = {
    sampleRate: number
    onFrames: (listener: (frames: Float32Array) => void) => void
    // Stops the microphone tracks and the audio graph, so the browser's recording indicator goes away.
    release: () => void
}

export type VoiceDeps = {
    isSupported: () => boolean
    // Must create and resume its AudioContext before its first await: iOS only starts audio inside
    // the tap that asked for it.
    openAudio: () => Promise<AudioSource>
    fetchToken: (signal: AbortSignal) => Promise<Response>
    openSocket: (url: string) => LiveSocket
    transcribe: (audio: Blob, signal: AbortSignal) => Promise<Response>
}

export type VoiceState = 'idle' | 'starting' | 'recording' | 'finishing' | 'transcribing'

export type VoiceErrorKind = 'mic-blocked' | 'no-speech' | 'busy' | 'failed'

// Where the live text goes: the composer keeps what was typed before as a prefix.
export type VoiceTarget = {
    begin: () => void
    show: (text: string) => void
    commit: (text: string) => void
    discard: () => void
}

type Options = { deps?: VoiceDeps; target: VoiceTarget }

type Session = {
    phase: Exclude<VoiceState, 'idle'>
    cancelled: boolean
    begun: boolean
    audio: AudioSource | null
    live: LiveSession | null
    liveReady: Promise<LiveSession | null>
    chunks: Int16Array[]
    flushChunks: () => void
    lastText: string
    controller: AbortController
    timer: ReturnType<typeof setInterval> | null
}

type ClipResult = { ok: true; text: string } | { ok: false; error: VoiceErrorKind }

const TICK_MS = 250
const TokenSchema = z.object({ token: z.string().min(1) })
const TranscriptSchema = z.object({ text: z.string() })
const PermissionErrorSchema = z.object({ name: z.enum(['NotAllowedError', 'SecurityError']) })
const FAILED: ClipResult = { ok: false, error: 'failed' }

const subscribeToNothing = () => () => {}

async function fetchLiveToken(
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
// step checks `cancelled` first, so a late microphone, socket message or upload never touches the
// state. The live socket is the main path; every chunk is also kept so a failed live session can
// still be transcribed by uploading the same audio as WAV.
// oxlint-disable-next-line max-lines-per-function -- one hook owns the whole recording state machine
export function useVoiceRecorder({ deps = browserVoiceDeps, target }: Options) {
    const [state, setState] = useState<VoiceState>('idle')
    const [seconds, setSeconds] = useState(0)
    const [error, setError] = useState<VoiceErrorKind | null>(null)
    // False on the server and during hydration, so the button never causes a mismatch.
    const supported = useSyncExternalStore(subscribeToNothing, deps.isSupported, () => false)

    const sessionRef = useRef<Session | null>(null)
    const optionsRef = useRef({ deps, target })
    useEffect(() => {
        optionsRef.current = { deps, target }
    })

    const setPhase = useCallback((session: Session, phase: Session['phase']) => {
        session.phase = phase
        setState(phase)
    }, [])

    const end = useCallback((session: Session, result: VoiceErrorKind | null) => {
        clearTimer(session)
        session.audio?.release()
        session.live?.close()
        if (sessionRef.current === session) sessionRef.current = null
        setState('idle')
        setSeconds(0)
        setError(result)
    }, [])

    const complete = useCallback(
        async (session: Session) => {
            const live = await session.liveReady
            const result =
                live === null || session.live === null
                    ? { ok: false as const }
                    : await live.finish()
            if (session.cancelled) return
            const { target: voiceTarget, deps: voiceDeps } = optionsRef.current
            if (result.ok) {
                voiceTarget.commit(result.text)
                end(session, null)
                return
            }
            if (session.chunks.length === 0) {
                voiceTarget.discard()
                end(session, 'no-speech')
                return
            }
            setPhase(session, 'transcribing')
            const clip = await transcribeClip(
                voiceDeps.transcribe,
                encodeWav(session.chunks),
                session.controller.signal
            )
            if (session.cancelled) return
            if (clip.ok) {
                voiceTarget.commit(clip.text)
                end(session, null)
                return
            }
            // A failed upload keeps the live partial text: losing words already shown is worse.
            if (session.lastText === '') {
                voiceTarget.discard()
                end(session, clip.error)
                return
            }
            voiceTarget.commit(session.lastText)
            end(session, 'failed')
        },
        [end, setPhase]
    )

    const stop = useCallback(
        (session: Session) => {
            if (session.phase !== 'recording') return
            setPhase(session, 'finishing')
            clearTimer(session)
            session.flushChunks()
            session.audio?.release()
            void complete(session)
        },
        [complete, setPhase]
    )

    const record = useCallback(
        async (session: Session, audioReady: Promise<AudioSource>) => {
            let audio: AudioSource
            try {
                audio = await audioReady
            } catch (openError) {
                if (session.cancelled) return
                end(
                    session,
                    PermissionErrorSchema.safeParse(openError).success ? 'mic-blocked' : 'failed'
                )
                return
            }
            if (session.cancelled) {
                audio.release()
                return
            }
            session.audio = audio

            const chunker = createChunker((chunk) => {
                session.chunks.push(chunk)
                session.live?.sendChunk(chunk)
            })
            session.flushChunks = () => chunker.flush()
            try {
                audio.onFrames((frames) => {
                    if (session.phase === 'recording')
                        chunker.push(toPcm16(downsample(frames, audio.sampleRate)))
                })
            } catch {
                end(session, 'failed')
                return
            }

            session.begun = true
            optionsRef.current.target.begin()
            setPhase(session, 'recording')
            const startedAt = Date.now()
            session.timer = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startedAt) / 1000)
                setSeconds(elapsed)
                if (elapsed >= VOICE_MAX_SECONDS) stop(session)
            }, TICK_MS)
        },
        [end, setPhase, stop]
    )

    const start = useCallback(() => {
        const { deps: voiceDeps } = optionsRef.current
        const controller = new AbortController()
        const session: Session = {
            phase: 'starting',
            cancelled: false,
            begun: false,
            audio: null,
            live: null,
            liveReady: Promise.resolve(null),
            chunks: [],
            flushChunks: () => {},
            lastText: '',
            controller,
            timer: null,
        }
        sessionRef.current = session
        setError(null)
        setSeconds(0)
        setState('starting')

        const audioReady = voiceDeps.openAudio()
        session.liveReady = fetchLiveToken(voiceDeps.fetchToken, controller.signal).then(
            (token) => {
                if (token === null || session.cancelled) return null
                const live = openLiveSession({
                    token,
                    openSocket: voiceDeps.openSocket,
                    onText: (text) => {
                        if (session.cancelled) return
                        session.lastText = text
                        optionsRef.current.target.show(text)
                    },
                    onFailure: () => {
                        session.live = null
                    },
                })
                session.chunks.forEach((chunk) => live.sendChunk(chunk))
                session.live = live
                return live
            }
        )
        void record(session, audioReady)
    }, [record])

    const cancel = useCallback(() => {
        const session = sessionRef.current
        if (session === null) return
        session.cancelled = true
        session.controller.abort()
        if (session.begun) optionsRef.current.target.discard()
        end(session, null)
    }, [end])

    const toggle = useCallback(() => {
        const session = sessionRef.current
        if (session === null) {
            if (optionsRef.current.deps.isSupported()) start()
            return
        }
        // A permission prompt can stay pending forever (dismissed in Firefox, iOS home screen apps),
        // so a tap while waiting starts over instead of being ignored.
        if (session.phase === 'starting') {
            cancel()
            start()
            return
        }
        if (session.phase === 'recording') stop(session)
    }, [cancel, start, stop])

    useEffect(() => cancel, [cancel])

    return { supported, state, seconds, error, toggle, cancel }
}
