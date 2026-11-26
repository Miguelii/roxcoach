/* oxlint-disable max-lines -- one suite per module, one case per behavior */
/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useVoiceRecorder } from '@/modules/coach/use-voice-recorder'
import {
    deferredResponse,
    fakeVoiceDeps,
    permissionDenied,
    type FakeVoiceOptions,
} from '@/modules/coach/__tests__/helpers'

const setup = (options: FakeVoiceOptions = {}) => {
    const { deps, recorders, transcribe } = fakeVoiceDeps(options)
    const onTranscript = vi.fn()
    const hook = renderHook(() => useVoiceRecorder({ deps, onTranscript }))
    return { ...hook, recorders, transcribe, onTranscript }
}

const flush = () => act(async () => {})

const toggle = async (result: { current: ReturnType<typeof useVoiceRecorder> }) => {
    act(() => result.current.toggle())
    await flush()
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useVoiceRecorder', () => {
    it('is not supported and ignores toggle when the browser cannot record', async () => {
        const { result, transcribe, recorders } = setup({ supported: false })
        expect(result.current.supported).toBe(false)
        await toggle(result)
        expect(result.current.state).toBe('idle')
        expect(recorders).toHaveLength(0)
        expect(transcribe).not.toHaveBeenCalled()
    })

    it('records, transcribes on the second toggle and hands over the text', async () => {
        const pending = deferredResponse()
        const { result, recorders, transcribe, onTranscript } = setup({
            respond: () => pending.promise,
        })
        expect(result.current.supported).toBe(true)
        await toggle(result)
        expect(result.current.state).toBe('recording')
        expect(recorders[0]?.started).toBe(true)

        await toggle(result)
        expect(result.current.state).toBe('transcribing')
        expect(recorders[0]?.released).toBe(true)
        expect(transcribe).toHaveBeenCalledTimes(1)
        const audio = transcribe.mock.calls[0]?.[0]
        expect(audio?.type).toBe('audio/webm;codecs=opus')
        expect(await audio?.text()).toBe('audio')

        pending.resolve(Response.json({ text: '  hello coach ' }))
        await flush()
        expect(onTranscript).toHaveBeenCalledWith('hello coach')
        expect(result.current.state).toBe('idle')
        expect(result.current.error).toBeNull()
    })

    it('counts the seconds while recording', async () => {
        const { result } = setup()
        await toggle(result)
        expect(result.current.seconds).toBe(0)
        act(() => vi.advanceTimersByTime(3000))
        expect(result.current.seconds).toBe(3)
    })

    it('stops on its own at 60 seconds and transcribes', async () => {
        const { result, transcribe, onTranscript, recorders } = setup()
        await toggle(result)
        act(() => vi.advanceTimersByTime(59_000))
        expect(transcribe).not.toHaveBeenCalled()
        act(() => vi.advanceTimersByTime(1000))
        await flush()
        expect(transcribe).toHaveBeenCalledTimes(1)
        expect(recorders[0]?.released).toBe(true)
        expect(onTranscript).toHaveBeenCalledWith('hello coach')
        expect(result.current.state).toBe('idle')
    })

    it('reports a blocked microphone', async () => {
        const { result } = setup({ openError: permissionDenied() })
        await toggle(result)
        expect(result.current.error).toBe('mic-blocked')
        expect(result.current.state).toBe('idle')
    })

    it('reports a failure when the microphone cannot open for another reason', async () => {
        const { result } = setup({ openError: new Error('no device') })
        await toggle(result)
        expect(result.current.error).toBe('failed')
    })

    it('makes no request for an empty clip and reports nothing heard', async () => {
        const { result, transcribe } = setup({ chunks: [] })
        await toggle(result)
        await toggle(result)
        expect(transcribe).not.toHaveBeenCalled()
        expect(result.current.error).toBe('no-speech')
        expect(result.current.state).toBe('idle')
    })

    it('reports nothing heard for a blank transcript', async () => {
        const { result, onTranscript } = setup({
            respond: async () => Response.json({ text: '   ' }),
        })
        await toggle(result)
        await toggle(result)
        expect(onTranscript).not.toHaveBeenCalled()
        expect(result.current.error).toBe('no-speech')
    })

    it('reports busy on a 429', async () => {
        const { result } = setup({ respond: async () => Response.json({}, { status: 429 }) })
        await toggle(result)
        await toggle(result)
        expect(result.current.error).toBe('busy')
    })

    it.each([
        ['a 502', async () => Response.json({}, { status: 502 })],
        ['a malformed body', async () => Response.json({ nope: 1 })],
        [
            'a rejected request',
            async () => {
                throw new TypeError('network')
            },
        ],
    ])('reports a failure on %s', async (_label, respond) => {
        const { result, onTranscript } = setup({ respond })
        await toggle(result)
        await toggle(result)
        expect(result.current.error).toBe('failed')
        expect(onTranscript).not.toHaveBeenCalled()
    })

    it('ignores toggles while transcribing', async () => {
        const pending = deferredResponse()
        const { result, transcribe, recorders } = setup({ respond: () => pending.promise })
        await toggle(result)
        await toggle(result)
        await toggle(result)
        expect(transcribe).toHaveBeenCalledTimes(1)
        expect(recorders).toHaveLength(1)
    })

    it('opens the microphone once for a fast double tap', async () => {
        const { result, recorders } = setup()
        act(() => {
            result.current.toggle()
            result.current.toggle()
        })
        await flush()
        expect(recorders).toHaveLength(1)
        expect(result.current.state).toBe('recording')
    })

    it('cancels a recording without a request', async () => {
        const { result, transcribe, recorders } = setup()
        await toggle(result)
        act(() => result.current.cancel())
        await flush()
        expect(recorders[0]?.released).toBe(true)
        expect(transcribe).not.toHaveBeenCalled()
        expect(result.current.state).toBe('idle')
        expect(result.current.seconds).toBe(0)
    })

    it('cancels a transcription in flight and drops its text', async () => {
        const pending = deferredResponse()
        const { result, transcribe, onTranscript } = setup({ respond: () => pending.promise })
        await toggle(result)
        await toggle(result)
        act(() => result.current.cancel())
        expect(transcribe.mock.calls[0]?.[1].aborted).toBe(true)
        pending.resolve(Response.json({ text: 'late' }))
        await flush()
        expect(onTranscript).not.toHaveBeenCalled()
        expect(result.current.state).toBe('idle')
    })

    it('releases the microphone on unmount', async () => {
        const { result, recorders, unmount, transcribe } = setup()
        await toggle(result)
        unmount()
        await flush()
        expect(recorders[0]?.released).toBe(true)
        expect(transcribe).not.toHaveBeenCalled()
    })

    it('clears the previous error when a new recording starts', async () => {
        const { result } = setup({ chunks: [] })
        await toggle(result)
        await toggle(result)
        expect(result.current.error).toBe('no-speech')
        await toggle(result)
        expect(result.current.error).toBeNull()
        expect(result.current.state).toBe('recording')
    })
})
