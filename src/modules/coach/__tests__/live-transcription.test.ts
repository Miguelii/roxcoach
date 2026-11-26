/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveSetupMessage, liveSocketUrl } from '@/_bff/core/constants/transcribe-live.constants'
import { FINAL_WAIT_MS, openLiveSession } from '@/modules/coach/live-transcription'
import { pcmToBase64 } from '@/modules/coach/pcm-audio'
import { fakeSocket, liveMessages, type FakeSocket } from '@/modules/coach/__tests__/helpers'

const setup = () => {
    let fake: FakeSocket | undefined
    const onText = vi.fn()
    const onFailure = vi.fn()
    const session = openLiveSession({
        token: 'auth_tokens/t1',
        openSocket: (url) => {
            fake = fakeSocket(url)
            return fake.socket
        },
        onText,
        onFailure,
    })
    if (!fake) throw new Error('socket not opened')
    return { session, socket: fake, onText, onFailure }
}

const ready = () => {
    const context = setup()
    context.socket.open()
    context.socket.receive(liveMessages.setupComplete)
    return context
}

const audioMessage = (chunk: Int16Array) => ({
    realtimeInput: { audio: { data: pcmToBase64(chunk), mimeType: 'audio/pcm;rate=16000' } },
})

const STREAM_END = { realtimeInput: { audioStreamEnd: true } }

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('openLiveSession', () => {
    it('opens the socket with the token and sends the setup first', () => {
        const { socket } = setup()
        expect(socket.url).toBe(liveSocketUrl('auth_tokens/t1'))
        expect(socket.sent).toEqual([])
        socket.open()
        expect(socket.sent).toEqual([liveSetupMessage()])
    })

    it('queues audio until setupComplete and then sends it in order', () => {
        const { session, socket } = setup()
        const first = Int16Array.of(1, 2)
        const second = Int16Array.of(3, 4)
        session.sendChunk(first)
        socket.open()
        session.sendChunk(second)
        expect(socket.sent).toEqual([liveSetupMessage()])
        socket.receive(liveMessages.setupComplete)
        expect(socket.sent).toEqual([liveSetupMessage(), audioMessage(first), audioMessage(second)])
        const third = Int16Array.of(5)
        session.sendChunk(third)
        expect(socket.sent.at(-1)).toEqual(audioMessage(third))
    })

    it('replaces the partial with each sentence final and keeps every earlier sentence', () => {
        const { socket, onText } = ready()
        socket.receive(liveMessages.partial('Amanhã tenho'))
        expect(onText).toHaveBeenLastCalledWith('Amanhã tenho')
        socket.receive(liveMessages.final(' Amanhã tenho treino de Hyrox. '))
        expect(onText).toHaveBeenLastCalledWith('Amanhã tenho treino de Hyrox.')
        socket.receive(liveMessages.partial('Achas que'))
        expect(onText).toHaveBeenLastCalledWith('Amanhã tenho treino de Hyrox. Achas que')
        socket.receive(liveMessages.final('Achas que devo descansar?'))
        expect(onText).toHaveBeenLastCalledWith(
            'Amanhã tenho treino de Hyrox. Achas que devo descansar?'
        )
    })

    it('ignores messages that are not JSON or carry no transcript', () => {
        const { socket, onText } = ready()
        socket.receive('not json')
        socket.receive(JSON.stringify({ usageMetadata: { totalTokenCount: 3 } }))
        expect(onText).not.toHaveBeenCalled()
    })

    it('ends the stream, waits for the final text and closes', async () => {
        const { session, socket } = ready()
        socket.receive(liveMessages.partial('long run'))
        const result = session.finish()
        expect(socket.sent.at(-1)).toEqual(STREAM_END)
        socket.receive(liveMessages.final('Long run no sábado?'))
        expect(await result).toEqual({ ok: true, text: 'Long run no sábado?' })
        expect(socket.closed).toBe(true)
    })

    it('sends the stream end after setup when finish comes first', () => {
        const { session, socket } = setup()
        socket.open()
        void session.finish()
        expect(socket.sent).toEqual([liveSetupMessage()])
        socket.receive(liveMessages.setupComplete)
        expect(socket.sent.at(-1)).toEqual(STREAM_END)
    })

    it('keeps the partial text when no final arrives in time', async () => {
        const { session, socket } = ready()
        socket.receive(liveMessages.partial('wall balls'))
        const result = session.finish()
        await vi.advanceTimersByTimeAsync(FINAL_WAIT_MS)
        expect(await result).toEqual({ ok: true, text: 'wall balls' })
        expect(socket.closed).toBe(true)
    })

    it('fails when no text arrived at all', async () => {
        const { session } = ready()
        const result = session.finish()
        await vi.advanceTimersByTimeAsync(FINAL_WAIT_MS)
        expect(await result).toEqual({ ok: false })
    })

    it('settles finish with what it has when the socket drops while waiting', async () => {
        const { session, socket } = ready()
        socket.receive(liveMessages.partial('sled push'))
        const result = session.finish()
        socket.drop()
        expect(await result).toEqual({ ok: true, text: 'sled push' })
    })

    it('reports an unexpected close once', () => {
        const { socket, onFailure } = ready()
        socket.drop()
        socket.drop()
        expect(onFailure).toHaveBeenCalledTimes(1)
    })

    it('reports nothing after close', () => {
        const { session, socket, onFailure, onText } = ready()
        session.close()
        expect(socket.closed).toBe(true)
        socket.drop()
        socket.receive(liveMessages.final('late'))
        expect(onFailure).not.toHaveBeenCalled()
        expect(onText).not.toHaveBeenCalled()
    })
})
