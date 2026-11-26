import { z } from 'zod'
import type { LiveSocket } from '@/modules/coach/live-transcription'
import { PCM_WORKLET_NAME, PCM_WORKLET_URL } from '@/modules/coach/pcm-worklet'
import type { AudioSource, VoiceDeps } from '@/modules/coach/use-voice-recorder'

const FramesSchema = z.instanceof(Float32Array)

const decoder = new TextDecoder()

async function openBrowserAudio(): Promise<AudioSource> {
    const context = new AudioContext()
    const resumed = context.resume()
    let stream: MediaStream | null = null
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        })
        await resumed
        await context.audioWorklet.addModule(PCM_WORKLET_URL)
        const source = context.createMediaStreamSource(stream)
        const capture = new AudioWorkletNode(context, PCM_WORKLET_NAME)
        // Some engines only run a node that reaches the destination; a muted gain keeps it silent.
        const mute = context.createGain()
        mute.gain.value = 0
        source.connect(capture).connect(mute).connect(context.destination)
        const tracks = stream.getTracks()
        let released = false
        return {
            sampleRate: context.sampleRate,
            onFrames: (listener) => {
                capture.port.addEventListener('message', (event) => {
                    const frames = FramesSchema.safeParse(event.data)
                    if (frames.success) listener(frames.data)
                })
                capture.port.start()
            },
            release: () => {
                if (released) return
                released = true
                capture.port.close()
                source.disconnect()
                tracks.forEach((track) => track.stop())
                void context.close()
            },
        }
    } catch (error) {
        stream?.getTracks().forEach((track) => track.stop())
        void context.close()
        throw error
    }
}

function openBrowserSocket(url: string): LiveSocket {
    const socket = new WebSocket(url)
    // Array buffers decode synchronously, so binary frames keep their order with text frames.
    socket.binaryType = 'arraybuffer'
    return {
        send: (data) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(data)
        },
        close: () => socket.close(),
        onOpen: (listener) => socket.addEventListener('open', () => listener()),
        onMessage: (listener) =>
            socket.addEventListener('message', (event) => {
                const text = z.string().safeParse(event.data)
                const bytes = z.instanceof(ArrayBuffer).safeParse(event.data)
                if (text.success) listener(text.data)
                else if (bytes.success) listener(decoder.decode(bytes.data))
            }),
        onClose: (listener) => socket.addEventListener('close', () => listener()),
    }
}

export const browserVoiceDeps: VoiceDeps = {
    // Secure origins only: mediaDevices is missing on plain http.
    isSupported: () =>
        'AudioWorkletNode' in globalThis &&
        'WebSocket' in globalThis &&
        'mediaDevices' in navigator,
    openAudio: openBrowserAudio,
    fetchToken: (signal) => fetch('/api/coach/transcribe/token', { method: 'POST', signal }),
    openSocket: openBrowserSocket,
    transcribe: (audio, signal) => {
        const body = new FormData()
        body.append('audio', audio, 'voice.wav')
        return fetch('/api/coach/transcribe', { method: 'POST', body, signal })
    },
}
