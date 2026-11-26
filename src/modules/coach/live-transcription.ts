import { z } from 'zod'
import { liveSetupMessage, liveSocketUrl } from '@/_bff/core/constants/transcribe-live.constants'
import { pcmToBase64 } from '@/modules/coach/pcm-audio'

export type LiveSocket = {
    send: (data: string) => void
    close: () => void
    onOpen: (listener: () => void) => void
    onMessage: (listener: (data: string) => void) => void
    onClose: (listener: () => void) => void
}

type LiveResult = { ok: true; text: string } | { ok: false }

export type LiveSession = {
    sendChunk: (chunk: Int16Array) => void
    finish: () => Promise<LiveResult>
    close: () => void
}

type Options = {
    token: string
    openSocket: (url: string) => LiveSocket
    onText: (text: string) => void
    onFailure: () => void
}

export const FINAL_WAIT_MS = 3000

const TranscriptSchema = z.looseObject({ text: z.string() })

const ServerMessageSchema = z.looseObject({
    setupComplete: z.looseObject({}).optional(),
    serverContent: z
        .looseObject({
            interimInputTranscription: TranscriptSchema.optional(),
            inputTranscription: TranscriptSchema.optional(),
        })
        .optional(),
})

const STREAM_END = JSON.stringify({ realtimeInput: { audioStreamEnd: true } })

const parseMessage = (data: string) => {
    try {
        const parsed = ServerMessageSchema.safeParse(JSON.parse(data))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

// One Gemini Live transcription over a socket. In SMART mode a final text is the whole cleaned
// transcript so far, so it replaces the shown text; a partial only covers the words since it.
export function openLiveSession({ token, openSocket, onText, onFailure }: Options): LiveSession {
    const socket = openSocket(liveSocketUrl(token))
    const queue: Int16Array[] = []
    let ready = false
    let ended = false
    let finishing = false
    let finalText = ''
    let partialText = ''
    let settle: ((result: LiveResult) => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const composed = () => [finalText, partialText].filter((text) => text !== '').join(' ')

    const sendAudio = (chunk: Int16Array) =>
        socket.send(
            JSON.stringify({
                realtimeInput: {
                    audio: { data: pcmToBase64(chunk), mimeType: 'audio/pcm;rate=16000' },
                },
            })
        )

    const close = () => {
        ended = true
        if (timer !== null) clearTimeout(timer)
        socket.close()
    }

    const resolveFinish = () => {
        const text = composed()
        settle?.(text === '' ? { ok: false } : { ok: true, text })
        settle = null
        close()
    }

    socket.onOpen(() => {
        if (!ended) socket.send(JSON.stringify(liveSetupMessage()))
    })

    socket.onMessage((data) => {
        if (ended) return
        const message = parseMessage(data)
        if (message === null) return
        if (message.setupComplete && !ready) {
            ready = true
            queue.splice(0).forEach((chunk) => sendAudio(chunk))
            if (finishing) socket.send(STREAM_END)
        }
        const interim = message.serverContent?.interimInputTranscription?.text
        const final = message.serverContent?.inputTranscription?.text
        if (interim === undefined && final === undefined) return
        if (final !== undefined) {
            finalText = final.trim()
            partialText = ''
        } else if (interim !== undefined) partialText = interim.trim()
        onText(composed())
        if (final !== undefined && finishing) resolveFinish()
    })

    socket.onClose(() => {
        if (ended) return
        if (finishing) {
            resolveFinish()
            return
        }
        ended = true
        onFailure()
    })

    return {
        sendChunk: (chunk) => {
            if (ended || finishing) return
            if (ready) sendAudio(chunk)
            else queue.push(chunk)
        },
        finish: () =>
            new Promise<LiveResult>((resolve) => {
                if (ended) {
                    resolve({ ok: false })
                    return
                }
                finishing = true
                settle = resolve
                if (ready) socket.send(STREAM_END)
                timer = setTimeout(resolveFinish, FINAL_WAIT_MS)
            }),
        close,
    }
}
