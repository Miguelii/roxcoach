/* oxlint-disable max-lines -- one suite per module, one case per behavior */
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCoachChat, type SendBody } from '@/modules/coach/use-coach-chat'
import {
    controlledStream,
    jsonStatus,
    ndjson,
    streamOf,
    streamOfBytes,
} from '@/modules/coach/__tests__/helpers'

const ID = '11111111-1111-4111-8111-111111111111'
const meta = { type: 'meta', conversationId: ID }
const text = (delta: string) => ({ type: 'text', delta })

const setup = (send: (body: SendBody, signal: AbortSignal) => Promise<Response>, extra = {}) =>
    renderHook(() => useCoachChat({ send, ...extra }))

describe('useCoachChat stream parsing', () => {
    it('reports whether sendMessage took the message', async () => {
        const stream = controlledStream()
        const { result } = renderHook(() =>
            useCoachChat({ send: vi.fn().mockResolvedValue(stream.response) })
        )
        let accepted: boolean | undefined
        act(() => {
            accepted = result.current.sendMessage('hi')
        })
        expect(accepted).toBe(true)
        act(() => {
            accepted = result.current.sendMessage('again')
        })
        expect(accepted).toBe(false)
        act(() => {
            accepted = result.current.sendMessage('   ')
        })
        expect(accepted).toBe(false)
    })

    it('streams text into one assistant message and finishes idle', async () => {
        const send = vi
            .fn()
            .mockResolvedValue(streamOf(ndjson(meta, text('Hel'), text('lo'), { type: 'done' })))
        const onReply = vi.fn()
        const { result } = setup(send, { onReply })
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(result.current.status).toBe('idle'))
        expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
            ['user', 'hi'],
            ['assistant', 'Hello'],
        ])
        expect(result.current.conversationId).toBe(ID)
        expect(onReply).toHaveBeenCalledTimes(1)
        expect(send.mock.calls[0]?.[0]).toEqual({ conversationId: null, message: 'hi' })
    })

    it('handles an event split between two chunks, several events in one chunk and a trailing partial line', async () => {
        const line = ndjson(text('ab'))
        const send = vi
            .fn()
            .mockResolvedValue(
                streamOf(
                    ndjson(meta) + line.slice(0, 7),
                    line.slice(7) + ndjson(text('cd'), text('ef')),
                    JSON.stringify({ type: 'done' })
                )
            )
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(result.current.status).toBe('idle'))
        expect(result.current.messages[1]?.content).toBe('abcdef')
    })

    it('decodes a multi-byte character split across chunks', async () => {
        const bytes = new TextEncoder().encode(
            ndjson(meta, text('café \u{1F3C3}'), { type: 'done' })
        )
        const cut = bytes.indexOf(0xc3) + 1
        const send = vi.fn().mockResolvedValue(streamOfBytes(bytes.slice(0, cut), bytes.slice(cut)))
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(result.current.status).toBe('idle'))
        expect(result.current.messages[1]?.content).toBe('café \u{1F3C3}')
    })

    it('ignores unknown event types, blank lines and invalid lines', async () => {
        const send = vi
            .fn()
            .mockResolvedValue(
                streamOf(
                    `\n${ndjson(meta, { type: 'weird', x: 1 }, text('ok'))}not json\n\n${ndjson({ type: 'done' })}`
                )
            )
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(result.current.status).toBe('idle'))
        expect(result.current.messages[1]?.content).toBe('ok')
    })

    it('sends the stored conversation id on the next message', async () => {
        const send = vi
            .fn()
            .mockImplementation(() =>
                Promise.resolve(streamOf(ndjson(meta, text('a'), { type: 'done' })))
            )
        const { result } = setup(send)
        act(() => result.current.sendMessage('one'))
        await waitFor(() => expect(result.current.status).toBe('idle'))
        act(() => result.current.sendMessage('two'))
        await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
        expect(send.mock.calls[1]?.[0]).toEqual({ conversationId: ID, message: 'two' })
    })
})

describe('useCoachChat failures', () => {
    it.each([
        [429, 'limit', 'limit'],
        [401, 'error', 'sign-in'],
        [403, 'error', 'sign-in'],
        [404, 'error', 'not-found'],
        [503, 'error', 'not-configured'],
        [500, 'error', 'busy'],
        [502, 'error', 'busy'],
    ])('maps HTTP %i to %s / %s', async (code, status, kind) => {
        const send = vi.fn().mockResolvedValue(jsonStatus(code))
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(result.current.status).toBe(status))
        expect(result.current.errorKind).toBe(kind)
        expect(result.current.messages.map((m) => m.role)).toEqual(['user'])
    })

    it('a 404 clears the conversation so sending again starts a new one', async () => {
        const send = vi
            .fn()
            .mockResolvedValueOnce(streamOf(ndjson(meta, { type: 'done' })))
            .mockResolvedValueOnce(jsonStatus(404))
            .mockResolvedValueOnce(streamOf(ndjson(meta, text('fresh'), { type: 'done' })))
        const { result } = setup(send)
        act(() => result.current.sendMessage('one'))
        await waitFor(() => expect(result.current.status).toBe('idle'))
        act(() => result.current.sendMessage('two'))
        await waitFor(() => expect(result.current.errorKind).toBe('not-found'))
        expect(result.current.conversationId).toBeNull()
        expect(result.current.failedText).toBe('two')
        act(() => result.current.sendMessage('two'))
        await waitFor(() => expect(result.current.status).toBe('idle'))
        expect(send.mock.calls[2]?.[0]).toEqual({ conversationId: null, message: 'two' })
    })

    it('a network failure is the busy error', async () => {
        const { result } = setup(vi.fn().mockRejectedValue(new TypeError('network')))
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(result.current.errorKind).toBe('busy'))
    })

    it.each(['rate_limited', 'unavailable'])(
        '%s keeps the partial text and sending the failed text again reuses its bubble',
        async (kind) => {
            const send = vi
                .fn()
                .mockResolvedValueOnce(streamOf(ndjson(meta, text('par'), { type: 'error', kind })))
                .mockResolvedValueOnce(streamOf(ndjson(meta, text('full'), { type: 'done' })))
            const { result } = setup(send)
            act(() => result.current.sendMessage('question'))
            await waitFor(() => expect(result.current.status).toBe('error'))
            expect(result.current.errorKind).toBe('busy')
            expect(result.current.messages[1]).toMatchObject({ content: 'par', incomplete: true })
            expect(result.current.failedText).toBe('question')
            act(() => result.current.sendMessage('question'))
            await waitFor(() => expect(result.current.status).toBe('idle'))
            expect(send.mock.calls[1]?.[0].message).toBe('question')
            expect(result.current.messages.map((m) => [m.role, m.content])).toEqual([
                ['user', 'question'],
                ['assistant', 'full'],
            ])
        }
    )

    it('blocked has its own kind and hands the text back', async () => {
        const send = vi
            .fn()
            .mockResolvedValue(streamOf(ndjson(meta, { type: 'error', kind: 'blocked' })))
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(result.current.errorKind).toBe('blocked'))
        expect(result.current.failedText).toBe('hi')
        expect(send).toHaveBeenCalledTimes(1)
    })

    it('a stream with no terminal line is an incomplete reply plus the busy error', async () => {
        const send = vi.fn().mockResolvedValue(streamOf(ndjson(meta, text('half'))))
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(result.current.status).toBe('error'))
        expect(result.current.errorKind).toBe('busy')
        expect(result.current.messages[1]).toMatchObject({ content: 'half', incomplete: true })
    })
})

describe('useCoachChat control', () => {
    it('stop aborts, keeps the partial text as incomplete and returns to idle', async () => {
        const stream = controlledStream()
        let signal: AbortSignal | undefined
        const send = vi.fn().mockImplementation((_body, s: AbortSignal) => {
            signal = s
            return Promise.resolve(stream.response)
        })
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        act(() => stream.push(ndjson(meta, text('part'))))
        await waitFor(() => expect(result.current.messages[1]?.content).toBe('part'))
        act(() => result.current.stop())
        await waitFor(() => expect(result.current.status).toBe('idle'))
        expect(signal?.aborted).toBe(true)
        expect(result.current.messages[1]).toMatchObject({ content: 'part', incomplete: true })
        expect(result.current.errorKind).toBeNull()
    })

    it('ignores a second send while one is in flight', async () => {
        const stream = controlledStream()
        const send = vi.fn().mockResolvedValue(stream.response)
        const { result } = setup(send)
        act(() => {
            result.current.sendMessage('one')
            result.current.sendMessage('two')
        })
        expect(send).toHaveBeenCalledTimes(1)
        expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1)
    })

    it('ignores events from a request superseded by newConversation', async () => {
        // A reader that ignores cancel(), like a misbehaving transport: its late data must not land.
        let deliver!: (result: { done: boolean; value?: Uint8Array }) => void
        const reader = {
            read: () =>
                new Promise<{ done: boolean; value?: Uint8Array }>((r) => {
                    deliver = r
                }),
            cancel: () => Promise.resolve(),
        }
        const response = new Response(null, { status: 200 })
        Object.defineProperty(response, 'body', { value: { getReader: () => reader } })
        const send = vi.fn().mockResolvedValue(response)
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(send).toHaveBeenCalled())
        await waitFor(() => expect(deliver).toBeDefined())
        act(() => result.current.newConversation())
        await act(async () => {
            deliver({
                done: false,
                value: new TextEncoder().encode(ndjson(meta, text('stale'), { type: 'done' })),
            })
            await new Promise((resolve) => {
                setTimeout(resolve, 20)
            })
        })
        expect(result.current.messages).toEqual([])
        expect(result.current.conversationId).toBeNull()
        expect(result.current.status).toBe('idle')
    })

    it('aborts the request on unmount', async () => {
        let signal: AbortSignal | undefined
        const send = vi.fn().mockImplementation((_body, s: AbortSignal) => {
            signal = s
            return Promise.resolve(controlledStream().response)
        })
        const { result, unmount } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(send).toHaveBeenCalled())
        unmount()
        expect(signal?.aborted).toBe(true)
    })

    it('openConversation loads its messages; a newer open wins over a slow older one', async () => {
        let resolveFirst!: (
            value: { id: string; role: 'user'; content: string; model: null }[]
        ) => void
        const loadMessages = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveFirst = resolve
                    })
            )
            .mockResolvedValueOnce([{ id: 'b', role: 'assistant', content: 'second', model: null }])
        const { result } = setup(vi.fn(), { loadMessages })
        act(() => void result.current.openConversation('a'))
        expect(result.current.status).toBe('loading-history')
        await act(async () => result.current.openConversation('b'))
        expect(result.current.messages.map((m) => m.content)).toEqual(['second'])
        await act(async () =>
            resolveFirst([{ id: 'a1', role: 'user', content: 'first', model: null }])
        )
        expect(result.current.messages.map((m) => m.content)).toEqual(['second'])
        expect(result.current.conversationId).toBe('b')
    })

    it('a failed history load is an error', async () => {
        const { result } = setup(vi.fn(), {
            loadMessages: vi.fn().mockRejectedValue(new Error('x')),
        })
        await act(async () => result.current.openConversation('a'))
        expect(result.current.errorKind).toBe('history')
    })

    it('does not send empty or over-long text', () => {
        const send = vi.fn()
        const { result } = setup(send)
        act(() => result.current.sendMessage('   '))
        act(() => result.current.sendMessage('x'.repeat(2001)))
        expect(send).not.toHaveBeenCalled()
    })
})

const modelEvent = (model: string, switchedFrom: string | null = null) => ({
    type: 'model',
    model,
    switchedFrom,
})
const M1 = 'gemini-4-hydrogen'
const M2 = 'gemini-3.8-flash'
const stored = (id: string, role: 'user' | 'assistant', model: string | null) => ({
    id,
    role,
    content: id,
    model,
})

const reply = async (
    result: { current: ReturnType<typeof useCoachChat> },
    send: ReturnType<typeof vi.fn>,
    ...events: object[]
) => {
    send.mockResolvedValueOnce(streamOf(ndjson(...events)))
    act(() => result.current.sendMessage('hi'))
    await waitFor(() => expect(result.current.status).not.toBe('streaming'))
}

describe('useCoachChat model caption and switch note', () => {
    it('sets the model id from a model event without a note', async () => {
        const send = vi.fn()
        const { result } = setup(send)
        await reply(result, send, meta, modelEvent(M1), text('a'), { type: 'done' })
        expect(result.current.modelId).toBe(M1)
        expect(result.current.messages.some((m) => m.switchNote)).toBe(false)
    })

    it('puts the note on the reply that switched and updates the caption', async () => {
        const send = vi.fn()
        const { result } = setup(send)
        await reply(result, send, meta, modelEvent(M2, M1), text('a'), { type: 'done' })
        expect(result.current.modelId).toBe(M2)
        expect(result.current.messages[1]?.switchNote).toEqual({ from: M1, to: M2 })
        expect(result.current.messages[0]?.switchNote).toBeUndefined()
    })

    it('only the switched reply carries a note', async () => {
        const send = vi.fn()
        const { result } = setup(send)
        await reply(result, send, meta, modelEvent(M1), text('a'), { type: 'done' })
        await reply(result, send, meta, modelEvent(M2, M1), text('b'), { type: 'done' })
        expect(result.current.messages.map((m) => m.switchNote !== undefined)).toEqual([
            false,
            false,
            false,
            true,
        ])
        expect(result.current.modelId).toBe(M2)
    })

    it('a plain stream without a model event leaves the caption unchanged', async () => {
        const send = vi.fn()
        const { result } = setup(send)
        await reply(result, send, meta, modelEvent(M1), text('a'), { type: 'done' })
        await reply(result, send, meta, text('b'), { type: 'done' })
        expect(result.current.modelId).toBe(M1)
    })

    it('keeps the previous caption when a model event is followed by an error', async () => {
        const send = vi.fn()
        const { result } = setup(send)
        await reply(result, send, meta, modelEvent(M1), text('a'), { type: 'done' })
        await reply(result, send, meta, modelEvent(M2, M1), { type: 'error', kind: 'unavailable' })
        expect(result.current.status).toBe('error')
        expect(result.current.modelId).toBe(M1)
    })

    it('an error alone keeps the last known caption', async () => {
        const send = vi.fn()
        const { result } = setup(send)
        await reply(result, send, meta, modelEvent(M1), text('a'), { type: 'done' })
        await reply(result, send, meta, { type: 'error', kind: 'unavailable' })
        expect(result.current.errorKind).toBe('busy')
        expect(result.current.modelId).toBe(M1)
    })

    it('newConversation clears the caption and the notes', async () => {
        const send = vi.fn()
        const { result } = setup(send)
        await reply(result, send, meta, modelEvent(M2, M1), text('a'), { type: 'done' })
        act(() => result.current.newConversation())
        expect(result.current.modelId).toBeNull()
        expect(result.current.messages).toEqual([])
    })

    it('openConversation uses the last assistant model and shows no note', async () => {
        const loadMessages = vi
            .fn()
            .mockResolvedValue([
                stored('u1', 'user', null),
                stored('a1', 'assistant', M1),
                stored('u2', 'user', null),
                stored('a2', 'assistant', M2),
                stored('u3', 'user', null),
                stored('a3', 'assistant', null),
            ])
        const { result } = setup(vi.fn(), { loadMessages })
        await act(async () => result.current.openConversation('c'))
        expect(result.current.modelId).toBe(M2)
        expect(result.current.messages.some((m) => m.switchNote)).toBe(false)
    })

    it('a history with only null models has no caption', async () => {
        const loadMessages = vi
            .fn()
            .mockResolvedValue([stored('u1', 'user', null), stored('a1', 'assistant', null)])
        const { result } = setup(vi.fn(), { loadMessages })
        await act(async () => result.current.openConversation('c'))
        expect(result.current.modelId).toBeNull()
        expect(result.current.messages).toHaveLength(2)
    })

    it('ignores model events of a superseded request', async () => {
        let deliver!: (result: { done: boolean; value?: Uint8Array }) => void
        const reader = {
            read: () =>
                new Promise<{ done: boolean; value?: Uint8Array }>((r) => {
                    deliver = r
                }),
            cancel: () => Promise.resolve(),
        }
        const response = new Response(null, { status: 200 })
        Object.defineProperty(response, 'body', { value: { getReader: () => reader } })
        const send = vi.fn().mockResolvedValue(response)
        const { result } = setup(send)
        act(() => result.current.sendMessage('hi'))
        await waitFor(() => expect(deliver).toBeDefined())
        act(() => result.current.newConversation())
        await act(async () => {
            deliver({
                done: false,
                value: new TextEncoder().encode(
                    ndjson(meta, modelEvent(M2, M1), text('late'), { type: 'done' })
                ),
            })
            await new Promise((resolve) => {
                setTimeout(resolve, 20)
            })
        })
        expect(result.current.modelId).toBeNull()
        expect(result.current.messages).toEqual([])
    })
})
