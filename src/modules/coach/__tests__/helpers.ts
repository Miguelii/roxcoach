import { vi } from 'vitest'
import type { VoiceDeps, VoiceRecorderLike } from '@/modules/coach/use-voice-recorder'

export type FakeRecorder = VoiceRecorderLike & {
    released: boolean
    started: boolean
}

export type FakeVoiceOptions = {
    supported?: boolean
    openError?: Error
    chunks?: Blob[]
    respond?: (audio: Blob, signal: AbortSignal) => Promise<Response>
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

const voiceClip = (text = 'audio') => new Blob([text], { type: 'audio/webm' })

// A recorder whose stop emits the given chunks synchronously, like a browser that already has them.
const fakeRecorder = (chunks: Blob[]): FakeRecorder => {
    const dataListeners: ((chunk: Blob) => void)[] = []
    const stopListeners: (() => void)[] = []
    const recorder: FakeRecorder = {
        mimeType: 'audio/webm;codecs=opus',
        released: false,
        started: false,
        start: () => {
            recorder.started = true
        },
        stop: () => {
            chunks.forEach((chunk) => dataListeners.forEach((listener) => listener(chunk)))
            stopListeners.forEach((listener) => listener())
        },
        release: () => {
            recorder.released = true
        },
        onData: (listener) => dataListeners.push(listener),
        onStop: (listener) => stopListeners.push(listener),
    }
    return recorder
}

export const fakeVoiceDeps = ({
    supported = true,
    openError,
    chunks = [voiceClip()],
    respond = async () => Response.json({ text: 'hello coach' }),
}: FakeVoiceOptions = {}) => {
    const recorders: FakeRecorder[] = []
    const transcribe = vi.fn(respond)
    const deps: VoiceDeps = {
        isSupported: () => supported,
        openRecorder: async () => {
            if (openError) throw openError
            const recorder = fakeRecorder(chunks)
            recorders.push(recorder)
            return recorder
        },
        transcribe,
    }
    return { deps, recorders, transcribe }
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
