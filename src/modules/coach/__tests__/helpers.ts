import { vi } from 'vitest'
import type { LiveSocket } from '@/modules/coach/live-transcription'
import type { AudioSource, VoiceDeps } from '@/modules/coach/use-voice-recorder'

export type FakeAudio = AudioSource & {
    released: boolean
    push: (frames: Float32Array) => void
}

export type FakeVoiceOptions = {
    supported?: boolean
    openError?: Error
    framesError?: Error
    // Leaves every openAudio pending until the test calls resolveAudio(index).
    pendingAudio?: boolean
    tokenStatus?: number
    tokenError?: boolean
    respond?: (audio: Blob, signal: AbortSignal) => Promise<Response>
}

export type FakeSocket = {
    socket: LiveSocket
    url: string
    sent: unknown[]
    closed: boolean
    open: () => void
    receive: (data: string) => void
    drop: () => void
}

const encoder = new TextEncoder()

export type Controlled = {
    response: Response
    push: (chunk: string) => void
    pushBytes: (chunk: Uint8Array) => void
    close: () => void
}

// A 200 NDJSON response whose chunks the test pushes by hand.
export const controlledStream = (): Controlled => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c
        },
    })
    return {
        response: new Response(body, { status: 200 }),
        push: (chunk) => controller.enqueue(encoder.encode(chunk)),
        pushBytes: (chunk) => controller.enqueue(chunk),
        close: () => controller.close(),
    }
}

export const ndjson = (...events: object[]) => events.map((e) => `${JSON.stringify(e)}\n`).join('')

// A complete 200 response made of the given byte chunks.
export const streamOfBytes = (...chunks: Uint8Array[]) => {
    const stream = controlledStream()
    chunks.forEach((chunk) => stream.pushBytes(chunk))
    stream.close()
    return stream.response
}

// A complete 200 response made of the given text chunks.
export const streamOf = (...chunks: string[]) =>
    streamOfBytes(...chunks.map((chunk) => encoder.encode(chunk)))

export const jsonStatus = (status: number) => Response.json({ error: 'x' }, { status })

// 48 kHz frames, so 4800 of them make one 1600 sample chunk at 16 kHz.
const fakeAudio = (framesError?: Error): FakeAudio => {
    const listeners: ((frames: Float32Array) => void)[] = []
    const audio: FakeAudio = {
        sampleRate: 48_000,
        released: false,
        onFrames: (listener) => {
            if (framesError) throw framesError
            listeners.push(listener)
        },
        release: () => {
            audio.released = true
        },
        push: (frames) => listeners.forEach((listener) => listener(frames)),
    }
    return audio
}

export const fakeVoiceDeps = ({
    supported = true,
    openError,
    framesError,
    pendingAudio = false,
    tokenStatus = 200,
    tokenError = false,
    respond = async () => Response.json({ text: 'hello coach' }),
}: FakeVoiceOptions = {}) => {
    const audios: FakeAudio[] = []
    const sockets: FakeSocket[] = []
    const audioResolvers: (() => void)[] = []
    const transcribe = vi.fn(respond)
    const fetchToken = vi.fn(async (_signal: AbortSignal) => {
        if (tokenError) throw new TypeError('network')
        return tokenStatus === 200
            ? Response.json({ token: 'auth_tokens/t1' })
            : Response.json({ error: 'x' }, { status: tokenStatus })
    })
    const openAudio = vi.fn(() => {
        if (openError) return Promise.reject(openError)
        const audio = fakeAudio(framesError)
        audios.push(audio)
        if (!pendingAudio) return Promise.resolve<AudioSource>(audio)
        return new Promise<AudioSource>((resolve) => {
            audioResolvers.push(() => resolve(audio))
        })
    })
    const deps: VoiceDeps = {
        isSupported: () => supported,
        openAudio,
        fetchToken,
        openSocket: (url) => {
            const socket = fakeSocket(url)
            sockets.push(socket)
            return socket.socket
        },
        transcribe,
    }
    const resolveAudio = (index: number) => audioResolvers[index]?.()
    return { deps, audios, sockets, transcribe, fetchToken, openAudio, resolveAudio }
}

export const deferredResponse = () => {
    let resolve!: (response: Response) => void
    const promise = new Promise<Response>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

export const permissionDenied = () => {
    const error = new Error('denied')
    error.name = 'NotAllowedError'
    return error
}

// A socket the test drives by hand: open, server messages and an unexpected close.
export const fakeSocket = (url: string): FakeSocket => {
    const openListeners: (() => void)[] = []
    const messageListeners: ((data: string) => void)[] = []
    const closeListeners: (() => void)[] = []
    const fake: FakeSocket = {
        url,
        sent: [],
        closed: false,
        socket: {
            send: (data) => fake.sent.push(JSON.parse(data)),
            close: () => {
                fake.closed = true
            },
            onOpen: (listener) => openListeners.push(listener),
            onMessage: (listener) => messageListeners.push(listener),
            onClose: (listener) => closeListeners.push(listener),
        },
        open: () => openListeners.forEach((listener) => listener()),
        receive: (data) => messageListeners.forEach((listener) => listener(data)),
        drop: () => closeListeners.forEach((listener) => listener()),
    }
    return fake
}

// Server frames as the socket delivers them: JSON text.
export const liveMessages = {
    setupComplete: JSON.stringify({ setupComplete: {} }),
    partial: (text: string) =>
        JSON.stringify({ serverContent: { interimInputTranscription: { text } } }),
    final: (text: string) => JSON.stringify({ serverContent: { inputTranscription: { text } } }),
}
