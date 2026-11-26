/* oxlint-disable max-lines -- one suite per module, one case per behavior */
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
// oxlint-disable max-lines-per-function
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { FINAL_WAIT_MS } from '@/modules/coach/live-transcription'
import { useVoiceRecorder, type VoiceTarget } from '@/modules/coach/use-voice-recorder'
import {
    deferredResponse,
    fakeVoiceDeps,
    liveMessages,
    permissionDenied,
    type FakeVoiceOptions,
} from '@/modules/coach/__tests__/helpers'

const STREAM_END = { realtimeInput: { audioStreamEnd: true } }
const CHUNK_FRAMES = 4800
const WAV_CHUNK_BYTES = 3200

const setup = (options: FakeVoiceOptions = {}) => {
    const fake = fakeVoiceDeps(options)
    const target = {
        begin: vi.fn<VoiceTarget['begin']>(),
        show: vi.fn<VoiceTarget['show']>(),
        commit: vi.fn<VoiceTarget['commit']>(),
        discard: vi.fn<VoiceTarget['discard']>(),
    }
    const hook = renderHook(() => useVoiceRecorder({ deps: fake.deps, target }))
    return { ...hook, ...fake, target }
}

type Context = ReturnType<typeof setup>

const flush = async () => {
    for (let round = 0; round < 6; round += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each round lets one more promise in the chain settle
        await act(async () => {})
    }
}

const toggle = async (context: Context) => {
    act(() => context.result.current.toggle())
    await flush()
}

const connect = (context: Context) => {
    const socket = context.sockets[0]
    if (!socket) throw new Error('no socket')
    act(() => {
        socket.open()
        socket.receive(liveMessages.setupComplete)
    })
    return socket
}

const speak = (context: Context, chunks = 1) =>
    act(() => context.audios.at(-1)?.push(new Float32Array(CHUNK_FRAMES * chunks).fill(0.25)))

const audioSent = (sent: unknown[]) =>
    sent.filter((message) => JSON.stringify(message).includes('"audio"'))

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useVoiceRecorder', () => {
    it('is not supported and ignores toggle when the browser cannot stream audio', async () => {
        const context = setup({ supported: false })
        expect(context.result.current.supported).toBe(false)
        await toggle(context)
        expect(context.openAudio).not.toHaveBeenCalled()
        expect(context.result.current.state).toBe('idle')
    })

    it('opens the audio inside the tap and asks for the token at the same time', () => {
        const context = setup()
        act(() => context.result.current.toggle())
        expect(context.openAudio).toHaveBeenCalledTimes(1)
        expect(context.fetchToken).toHaveBeenCalledTimes(1)
        expect(context.result.current.state).toBe('starting')
    })

    it('streams 100 ms chunks and shows the live text', async () => {
        const context = setup()
        await toggle(context)
        expect(context.result.current.state).toBe('recording')
        expect(context.target.begin).toHaveBeenCalledTimes(1)
        const socket = connect(context)
        speak(context, 2)
        expect(audioSent(socket.sent)).toHaveLength(2)
        act(() => socket.receive(liveMessages.partial('treino')))
        expect(context.target.show).toHaveBeenLastCalledWith('treino')
    })

    it('sends the audio recorded before the socket was ready', async () => {
        const context = setup()
        await toggle(context)
        speak(context)
        const socket = connect(context)
        expect(audioSent(socket.sent)).toHaveLength(1)
    })

    it('ends the stream on stop and commits the final text', async () => {
        const context = setup()
        await toggle(context)
        const socket = connect(context)
        speak(context)
        await toggle(context)
        expect(context.result.current.state).toBe('finishing')
        expect(context.audios[0]?.released).toBe(true)
        expect(socket.sent.at(-1)).toEqual(STREAM_END)

        act(() => socket.receive(liveMessages.final('Long run no sábado?')))
        await flush()
        expect(context.target.commit).toHaveBeenCalledWith('Long run no sábado?')
        expect(context.result.current.state).toBe('idle')
        expect(socket.closed).toBe(true)
        expect(context.transcribe).not.toHaveBeenCalled()
    })

    it('counts the seconds from the clock', async () => {
        const context = setup()
        await toggle(context)
        act(() => vi.advanceTimersByTime(3000))
        expect(context.result.current.seconds).toBe(3)
    })

    it('stops on its own after 60 seconds of wall-clock time', async () => {
        const context = setup()
        await toggle(context)
        connect(context)
        act(() => vi.advanceTimersByTime(60_000))
        expect(context.result.current.state).toBe('finishing')
        expect(context.audios[0]?.released).toBe(true)
    })

    describe('fallback', () => {
        const fallbackCases: [string, FakeVoiceOptions, (context: Context) => Promise<void>][] = [
            ['the token request fails', { tokenStatus: 502 }, async () => {}],
            ['the token request rejects', { tokenError: true }, async () => {}],
            [
                'the socket drops before setup',
                {},
                async (context) => {
                    act(() => context.sockets[0]?.drop())
                },
            ],
            [
                'the socket drops after partial text',
                {},
                async (context) => {
                    const socket = connect(context)
                    speak(context)
                    act(() => {
                        socket.receive(liveMessages.partial('abc'))
                        socket.drop()
                    })
                },
            ],
        ]

        it.each(fallbackCases)(
            'uploads every chunk as WAV when %s',
            async (_label, options, breakLive) => {
                const context = setup(options)
                await toggle(context)
                await breakLive(context)
                speak(context)
                await toggle(context)
                expect(context.transcribe).toHaveBeenCalledTimes(1)
                const audio = context.transcribe.mock.calls[0]?.[0]
                expect(audio?.type).toBe('audio/wav')
                const chunks = audioSent(context.sockets[0]?.sent ?? []).length
                expect(audio?.size).toBe(44 + WAV_CHUNK_BYTES * Math.max(1, chunks + 1))
                expect(context.target.commit).toHaveBeenCalledWith('hello coach')
                expect(context.result.current.state).toBe('idle')
            }
        )

        it('uploads when the live session ends with no text', async () => {
            const pending = deferredResponse()
            const context = setup({ respond: () => pending.promise })
            await toggle(context)
            connect(context)
            speak(context)
            await toggle(context)
            await act(async () => vi.advanceTimersByTime(FINAL_WAIT_MS))
            await flush()
            expect(context.result.current.state).toBe('transcribing')
            expect(context.transcribe).toHaveBeenCalledTimes(1)
            await act(async () => pending.resolve(Response.json({ text: 'from upload' })))
            await flush()
            expect(context.target.commit).toHaveBeenCalledWith('from upload')
        })

        it('keeps the partial text when the upload also fails', async () => {
            const context = setup({ respond: async () => Response.json({}, { status: 502 }) })
            await toggle(context)
            const socket = connect(context)
            speak(context)
            act(() => {
                socket.receive(liveMessages.partial('wall balls'))
                socket.drop()
            })
            await toggle(context)
            expect(context.target.commit).toHaveBeenCalledWith('wall balls')
            expect(context.result.current.error).toBe('failed')
        })

        it('discards and reports busy when the upload is rate limited with no partial text', async () => {
            const context = setup({
                tokenStatus: 502,
                respond: async () => Response.json({}, { status: 429 }),
            })
            await toggle(context)
            speak(context)
            await toggle(context)
            expect(context.target.discard).toHaveBeenCalledTimes(1)
            expect(context.target.commit).not.toHaveBeenCalled()
            expect(context.result.current.error).toBe('busy')
        })

        it('reports nothing heard when the upload comes back blank', async () => {
            const context = setup({
                tokenStatus: 502,
                respond: async () => Response.json({ text: ' ' }),
            })
            await toggle(context)
            speak(context)
            await toggle(context)
            expect(context.target.discard).toHaveBeenCalledTimes(1)
            expect(context.result.current.error).toBe('no-speech')
        })

        it('makes no upload when nothing was recorded', async () => {
            const context = setup({ tokenStatus: 502 })
            await toggle(context)
            await toggle(context)
            expect(context.transcribe).not.toHaveBeenCalled()
            expect(context.result.current.error).toBe('no-speech')
        })
    })

    it('reports a blocked microphone without touching the box', async () => {
        const context = setup({ openError: permissionDenied() })
        await toggle(context)
        expect(context.result.current.error).toBe('mic-blocked')
        expect(context.target.begin).not.toHaveBeenCalled()
        expect(context.result.current.state).toBe('idle')
    })

    it('reports a failure when the microphone cannot open for another reason', async () => {
        const context = setup({ openError: new Error('no device') })
        await toggle(context)
        expect(context.result.current.error).toBe('failed')
    })

    it('releases the audio and reports a failure when the capture cannot start', async () => {
        const context = setup({ framesError: new Error('worklet') })
        await toggle(context)
        expect(context.audios[0]?.released).toBe(true)
        expect(context.result.current.error).toBe('failed')
        expect(context.result.current.state).toBe('idle')
    })

    it('restarts when tapped while the permission prompt is still open', async () => {
        const context = setup({ pendingAudio: true })
        await toggle(context)
        await toggle(context)
        expect(context.openAudio).toHaveBeenCalledTimes(2)
        await act(async () => {
            context.resolveAudio(0)
            context.resolveAudio(1)
        })
        await flush()
        expect(context.audios[0]?.released).toBe(true)
        expect(context.audios[1]?.released).toBe(false)
        expect(context.result.current.state).toBe('recording')
        expect(context.sockets.filter((socket) => !socket.closed)).toHaveLength(1)
    })

    it('ignores taps while finishing', async () => {
        const context = setup()
        await toggle(context)
        connect(context)
        speak(context)
        await toggle(context)
        await toggle(context)
        expect(context.openAudio).toHaveBeenCalledTimes(1)
        expect(context.result.current.state).toBe('finishing')
    })

    it('cancels a recording, restores the box and drops late text', async () => {
        const context = setup()
        await toggle(context)
        const socket = connect(context)
        speak(context)
        act(() => context.result.current.cancel())
        expect(context.audios[0]?.released).toBe(true)
        expect(socket.closed).toBe(true)
        expect(context.target.discard).toHaveBeenCalledTimes(1)
        expect(context.result.current.state).toBe('idle')
        act(() => socket.receive(liveMessages.final('late')))
        await flush()
        expect(context.target.commit).not.toHaveBeenCalled()
        expect(context.transcribe).not.toHaveBeenCalled()
    })

    it('cancels an upload in flight', async () => {
        const pending = deferredResponse()
        const context = setup({ tokenStatus: 502, respond: () => pending.promise })
        await toggle(context)
        speak(context)
        await toggle(context)
        expect(context.result.current.state).toBe('transcribing')
        act(() => context.result.current.cancel())
        expect(context.transcribe.mock.calls[0]?.[1].aborted).toBe(true)
        await act(async () => pending.resolve(Response.json({ text: 'late' })))
        await flush()
        expect(context.target.commit).not.toHaveBeenCalled()
    })

    it('releases everything on unmount', async () => {
        const context = setup()
        await toggle(context)
        const socket = connect(context)
        context.unmount()
        expect(context.audios[0]?.released).toBe(true)
        expect(socket.closed).toBe(true)
    })

    it('clears the previous error when a new recording starts', async () => {
        const context = setup({ tokenStatus: 502 })
        await toggle(context)
        await toggle(context)
        expect(context.result.current.error).toBe('no-speech')
        await toggle(context)
        expect(context.result.current.error).toBeNull()
        expect(context.result.current.state).toBe('recording')
    })
})
