/* oxlint-disable unicorn/consistent-function-scoping -- test helpers stay next to the cases that use them */
/* oxlint-disable max-lines -- one suite per module, one case per behavior */
// oxlint-disable max-lines-per-function
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CoachChatView } from '@/modules/coach/coach-chat-view'
import { COACH_SUGGESTIONS } from '@/modules/coach/suggestions'
import { useCoachChat, type SendBody } from '@/modules/coach/use-coach-chat'
import type { VoiceDeps } from '@/modules/coach/use-voice-recorder'
import {
    controlledStream,
    deferredResponse,
    fakeVoiceDeps,
    jsonStatus,
    liveMessages,
    ndjson,
    permissionDenied,
    streamOf,
} from '@/modules/coach/__tests__/helpers'

const ID = '11111111-1111-4111-8111-111111111111'
const meta = { type: 'meta', conversationId: ID }
const text = (delta: string) => ({ type: 'text', delta })
const done = { type: 'done' }

const noop = () => {}

type HarnessProps = {
    send?: (body: SendBody, signal: AbortSignal) => Promise<Response>
    loadMessages?: (
        id: string
    ) => Promise<
        { id: string; role: 'user' | 'assistant'; content: string; model: string | null }[]
    >
    conversations?: { id: string; title: string; updatedAt: string }[]
    onDelete?: (id: string) => void
    startOpen?: boolean
    voiceDeps?: VoiceDeps
}

function Harness({
    send,
    loadMessages,
    conversations,
    onDelete = noop,
    startOpen = true,
    voiceDeps = fakeVoiceDeps({ supported: false }).deps,
}: HarnessProps) {
    const chat = useCoachChat({ send, loadMessages })
    return <HarnessView {...{ chat, conversations, onDelete, startOpen, voiceDeps }} />
}

import { useState } from 'react'
function HarnessView({
    chat,
    conversations,
    onDelete,
    startOpen,
    voiceDeps,
}: {
    chat: ReturnType<typeof useCoachChat>
    conversations: HarnessProps['conversations']
    onDelete: (id: string) => void
    startOpen: boolean
    voiceDeps: VoiceDeps
}) {
    const [open, setOpen] = useState(startOpen)
    const [launcherEnabled, setLauncherEnabled] = useState(true)
    const onDismissLauncher = () => setLauncherEnabled(false)
    return (
        <CoachChatView
            open={open}
            onOpenChange={setOpen}
            launcherEnabled={launcherEnabled}
            onDismissLauncher={onDismissLauncher}
            messages={chat.messages}
            status={chat.status}
            errorKind={chat.errorKind}
            conversationId={chat.conversationId}
            modelId={chat.modelId}
            conversations={conversations}
            chips={COACH_SUGGESTIONS}
            onSend={chat.sendMessage}
            onStop={chat.stop}
            onNew={chat.newConversation}
            onOpen={(id) => void chat.openConversation(id)}
            onDelete={onDelete}
            onRetry={chat.retry}
            voiceDeps={voiceDeps}
        />
    )
}

const type = (value: string) =>
    fireEvent.change(screen.getByTestId('coach-input'), { target: { value } })

describe('CoachChatView', () => {
    it('shows the launcher bar and opens the panel without focusing the input', () => {
        render(<Harness startOpen={false} />)
        expect(screen.queryByTestId('coach-panel')).not.toBeInTheDocument()
        fireEvent.click(screen.getByTestId('coach-launcher'))
        expect(screen.getByTestId('coach-panel')).toBeInTheDocument()
        expect(screen.getByTestId('coach-input')).not.toHaveFocus()
    })

    it('hides the launcher with its X button', () => {
        render(<Harness startOpen={false} />)
        fireEvent.click(screen.getByTestId('coach-launcher-dismiss'))
        expect(screen.queryByTestId('coach-launcher')).not.toBeInTheDocument()
        expect(screen.queryByTestId('coach-panel')).not.toBeInTheDocument()
    })

    it('closes when the scrim around the centered panel is clicked, but not the panel itself', () => {
        render(<Harness />)
        fireEvent.click(screen.getByTestId('coach-panel'))
        expect(screen.getByTestId('coach-panel')).toBeInTheDocument()

        fireEvent.click(screen.getByTestId('coach-scrim'))
        expect(screen.getByTestId('coach-launcher')).toBeInTheDocument()
    })

    it('closes on Escape even when the focus is outside the panel', () => {
        render(<Harness />)
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        expect(screen.getByTestId('coach-input')).not.toHaveFocus()

        fireEvent.keyDown(document.body, { key: 'Escape' })
        expect(screen.getByTestId('coach-launcher')).toBeInTheDocument()
    })

    it('ignores an Escape that was already handled inside the panel', () => {
        render(<Harness />)
        const handled = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        })
        handled.preventDefault()
        document.body.dispatchEvent(handled)

        expect(screen.getByTestId('coach-panel')).toBeInTheDocument()
    })

    it('stops listening for Escape once the panel is closed', () => {
        render(<Harness startOpen={false} />)
        fireEvent.keyDown(document.body, { key: 'Escape' })

        expect(screen.queryByTestId('coach-panel')).not.toBeInTheDocument()
        expect(screen.getByTestId('coach-launcher')).toBeInTheDocument()
    })

    it('keeps the panel mounted while it slides out, then removes it', () => {
        render(<Harness />)
        fireEvent.click(screen.getByTestId('coach-close'))

        const panel = screen.getByTestId('coach-panel')
        expect(panel).toHaveAttribute('data-state', 'closed')
        expect(screen.getByTestId('coach-scrim')).toHaveClass(
            'data-[state=closed]:pointer-events-none'
        )
        expect(screen.getByTestId('coach-launcher')).toBeInTheDocument()

        fireEvent.transitionEnd(panel)
        expect(screen.queryByTestId('coach-panel')).not.toBeInTheDocument()
    })

    it('reopens from the middle of the slide out without remounting', () => {
        render(<Harness />)
        fireEvent.click(screen.getByTestId('coach-close'))
        fireEvent.click(screen.getByTestId('coach-launcher'))

        expect(screen.getByTestId('coach-panel')).toHaveAttribute('data-state', 'open')
    })

    it('removes a closing panel even when no transition fires', () => {
        vi.useFakeTimers()
        try {
            render(<Harness />)
            fireEvent.click(screen.getByTestId('coach-close'))
            act(() => {
                vi.advanceTimersByTime(600)
            })
            expect(screen.queryByTestId('coach-panel')).not.toBeInTheDocument()
        } finally {
            vi.useRealTimers()
        }
    })

    it('closes with the close button and Escape', () => {
        render(<Harness />)
        fireEvent.click(screen.getByTestId('coach-close'))
        expect(screen.getByTestId('coach-launcher')).toBeInTheDocument()
        fireEvent.click(screen.getByTestId('coach-launcher'))
        fireEvent.keyDown(screen.getByTestId('coach-panel'), { key: 'Escape' })
        expect(screen.getByTestId('coach-launcher')).toBeInTheDocument()
    })

    it('shows the greeting and the three chips, and a chip sends its text', async () => {
        const send = vi.fn().mockResolvedValue(streamOf(ndjson(meta, text('ok'), done)))
        render(<Harness send={send} />)
        expect(screen.getByTestId('coach-greeting')).toBeInTheDocument()
        const chips = screen.getAllByTestId('coach-chip')
        expect(chips.map((c) => c.textContent)).toEqual([
            'How is my training going?',
            'Am I on track for my next race?',
            'What should I do this week?',
        ])
        fireEvent.click(chips[1]!)
        await waitFor(() =>
            expect(screen.getByTestId('coach-message-assistant')).toHaveTextContent('ok')
        )
        expect(send.mock.calls[0]?.[0].message).toBe('Am I on track for my next race?')
        expect(screen.queryByTestId('coach-empty')).not.toBeInTheDocument()
    })

    it('has no microphone control', () => {
        render(<Harness />)
        expect(screen.getByTestId('coach-panel').innerHTML.toLowerCase()).not.toMatch(
            /microphone|voice|mic\b/u
        )
    })

    it('streams into one assistant bubble, disables send and shows stop; stop marks it incomplete and the input stays editable', async () => {
        const stream = controlledStream()
        render(<Harness send={() => Promise.resolve(stream.response)} />)
        type('How am I doing?')
        fireEvent.click(screen.getByTestId('coach-send'))
        await waitFor(() => expect(screen.getByTestId('coach-stop')).toBeInTheDocument())
        expect(screen.getByTestId('coach-send')).toBeDisabled()
        type('next question')
        expect(screen.getByTestId('coach-send')).toBeDisabled()
        act(() => stream.push(ndjson(meta, text('Part one '), text('and two'))))
        await waitFor(() =>
            expect(screen.getAllByTestId('coach-message-assistant')).toHaveLength(1)
        )
        expect(screen.getByTestId('coach-message-assistant')).toHaveTextContent('Part one and two')
        fireEvent.click(screen.getByTestId('coach-stop'))
        await waitFor(() =>
            expect(screen.getByTestId('coach-incomplete')).toHaveTextContent('Incomplete reply')
        )
        expect(screen.getByTestId('coach-message-assistant')).toHaveTextContent('Part one and two')
        expect(screen.queryByTestId('coach-stop')).not.toBeInTheDocument()
        expect(screen.getByTestId('coach-input')).toHaveValue('next question')
        expect(screen.getByTestId('coach-input')).not.toBeDisabled()
    })

    it('Enter sends and Shift+Enter does not', async () => {
        const send = vi.fn().mockResolvedValue(streamOf(ndjson(meta, text('a'), done)))
        render(<Harness send={send} />)
        type('hello')
        fireEvent.keyDown(screen.getByTestId('coach-input'), { key: 'Enter', shiftKey: true })
        expect(send).not.toHaveBeenCalled()
        fireEvent.keyDown(screen.getByTestId('coach-input'), { key: 'Enter' })
        await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(screen.getByTestId('coach-input')).toHaveValue(''))
    })

    it('a double submit sends once', async () => {
        const stream = controlledStream()
        const send = vi.fn().mockResolvedValue(stream.response)
        render(<Harness send={send} />)
        type('hello')
        fireEvent.keyDown(screen.getByTestId('coach-input'), { key: 'Enter' })
        fireEvent.keyDown(screen.getByTestId('coach-input'), { key: 'Enter' })
        fireEvent.click(screen.getByTestId('coach-send'))
        await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    })

    it('blocks a message over 2000 characters with a visible message', async () => {
        const send = vi.fn()
        render(<Harness send={send} />)
        type('x'.repeat(2001))
        expect(screen.getByTestId('coach-send')).toBeDisabled()
        expect(screen.getByTestId('coach-char-count')).toHaveTextContent('2001/2000')
        await waitFor(() =>
            expect(screen.getByTestId('coach-input-error')).toHaveTextContent('2000')
        )
        fireEvent.keyDown(screen.getByTestId('coach-input'), { key: 'Enter' })
        expect(send).not.toHaveBeenCalled()
    })

    it('shows the limit message on a 429', async () => {
        render(<Harness send={() => Promise.resolve(jsonStatus(429))} />)
        type('hi')
        fireEvent.click(screen.getByTestId('coach-send'))
        await waitFor(() =>
            expect(screen.getByTestId('coach-limit')).toHaveTextContent(
                "You reached today's message limit"
            )
        )
        expect(screen.queryByTestId('coach-retry')).not.toBeInTheDocument()
    })

    it.each(['rate_limited', 'unavailable'])(
        '%s shows the busy message and retry resends the same text',
        async (kind) => {
            const send = vi
                .fn()
                .mockResolvedValueOnce(streamOf(ndjson(meta, { type: 'error', kind })))
                .mockResolvedValueOnce(streamOf(ndjson(meta, text('fine'), done)))
            render(<Harness send={send} />)
            type('same text')
            fireEvent.click(screen.getByTestId('coach-send'))
            await waitFor(() =>
                expect(screen.getByTestId('coach-error-text')).toHaveTextContent(
                    'The coach is busy, try again in a minute'
                )
            )
            fireEvent.click(screen.getByTestId('coach-retry'))
            await waitFor(() =>
                expect(screen.getByTestId('coach-message-assistant')).toHaveTextContent('fine')
            )
            expect(send.mock.calls[1]?.[0].message).toBe('same text')
            expect(screen.getAllByTestId('coach-message-user')).toHaveLength(1)
            expect(screen.queryByTestId('coach-error')).not.toBeInTheDocument()
        }
    )

    it('shows the blocked message without retry and the sign-in message on 401', async () => {
        const send = vi
            .fn()
            .mockResolvedValueOnce(streamOf(ndjson(meta, { type: 'error', kind: 'blocked' })))
        render(<Harness send={send} />)
        type('x')
        fireEvent.click(screen.getByTestId('coach-send'))
        await waitFor(() =>
            expect(screen.getByTestId('coach-error-text')).toHaveTextContent(
                'The coach cannot answer that. Try rephrasing.'
            )
        )
        expect(screen.queryByTestId('coach-retry')).not.toBeInTheDocument()
    })

    it('announces the finished reply once in the live region, not the deltas', async () => {
        const stream = controlledStream()
        render(<Harness send={() => Promise.resolve(stream.response)} />)
        type('hi')
        fireEvent.click(screen.getByTestId('coach-send'))
        act(() => stream.push(ndjson(meta, text('Hello'))))
        await waitFor(() =>
            expect(screen.getByTestId('coach-message-assistant')).toHaveTextContent('Hello')
        )
        expect(screen.getByTestId('coach-live-region')).toHaveTextContent('')
        expect(screen.getByTestId('coach-live-region')).toHaveAttribute('aria-live', 'polite')
        act(() => {
            stream.push(ndjson(done))
            stream.close()
        })
        await waitFor(() =>
            expect(screen.getByTestId('coach-live-region')).toHaveTextContent('Hello')
        )
    })

    describe('markdown', () => {
        const reply = (content: string) =>
            render(
                <Harness
                    send={() => Promise.resolve(streamOf(ndjson(meta, text(content), done)))}
                />
            )
        const ask = async () => {
            type('hi')
            fireEvent.click(screen.getByTestId('coach-send'))
            await waitFor(() =>
                expect(screen.getByTestId('coach-message-markdown')).toBeInTheDocument()
            )
        }

        it('renders paragraphs, lists and bold', async () => {
            reply('First **bold** paragraph\n\n- one\n- two\n\nSecond')
            await ask()
            const md = screen.getByTestId('coach-message-markdown')
            expect(md.querySelectorAll('p')).toHaveLength(2)
            expect(md.querySelector('strong')).toHaveTextContent('bold')
            expect(md.querySelectorAll('li')).toHaveLength(2)
        })

        it('shows raw HTML as inert text and drops images and javascript links', async () => {
            reply(
                '<script>alert(1)</script> <img src=x onerror=alert(1)> [click](javascript:alert(1)) ![pic](http://x/y.png)'
            )
            await ask()
            const md = screen.getByTestId('coach-message-markdown')
            expect(md.querySelector('script')).toBeNull()
            expect(md.querySelector('img')).toBeNull()
            expect(md.querySelector('[onerror]')).toBeNull()
            expect(md.textContent).toContain('<script>')
            const link = md.querySelector('a')
            expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript:/iu)
        })

        it('renders user text as plain text, not markdown', async () => {
            reply('ok')
            type('**not bold** <b>x</b>')
            fireEvent.click(screen.getByTestId('coach-send'))
            await waitFor(() =>
                expect(screen.getByTestId('coach-message-user')).toBeInTheDocument()
            )
            const user = screen.getByTestId('coach-message-user')
            expect(user.querySelector('strong')).toBeNull()
            expect(user.querySelector('b')).toBeNull()
            expect(user).toHaveTextContent('**not bold** <b>x</b>')
        })
    })

    describe('responsive containers', () => {
        it('is full screen on narrow screens and a centered dialog over a scrim from md', () => {
            render(<Harness />)
            expect(screen.getByTestId('coach-scrim')).toHaveClass('fixed', 'inset-0')
            expect(screen.getByTestId('coach-scrim')).toHaveClass(
                'md:flex',
                'md:items-center',
                'md:justify-center'
            )
            expect(screen.getByTestId('coach-panel')).toHaveClass(
                'h-full',
                'w-full',
                'md:max-w-[46rem]'
            )
            expect(screen.getByTestId('coach-panel')).not.toHaveClass('md:right-4')
        })

        it('follows the visible viewport, so the iOS keyboard does not reveal the page below', () => {
            const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 })
            vi.stubGlobal('visualViewport', viewport)
            render(<Harness />)
            const scrim = screen.getByTestId('coach-scrim')
            expect(scrim).toHaveStyle({ top: '0px', height: '800px' })

            act(() => {
                Object.assign(viewport, { height: 420, offsetTop: 260 })
                viewport.dispatchEvent(new Event('resize'))
            })
            expect(scrim).toHaveStyle({ top: '260px', height: '420px' })
            vi.unstubAllGlobals()
        })

        it('locks the page scroll while open and restores it when closed', () => {
            const { unmount } = render(<Harness />)
            expect(document.documentElement.style.overflow).toBe('hidden')
            unmount()
            expect(document.documentElement.style.overflow).toBe('')
        })
    })

    describe('history menu', () => {
        const conversations = [
            { id: 'c1', title: 'Pacing talk', updatedAt: '2026-11-19T10:00:00Z' },
            { id: 'c2', title: 'Hyrox plan', updatedAt: '2026-11-18T10:00:00Z' },
        ]

        it('lists conversations and opens one, loading its messages with a skeleton', async () => {
            let resolve!: (
                v: { id: string; role: 'user' | 'assistant'; content: string; model: null }[]
            ) => void
            const loadMessages = vi.fn().mockImplementation(
                () =>
                    new Promise((r) => {
                        resolve = r
                    })
            )
            render(<Harness conversations={conversations} loadMessages={loadMessages} />)
            fireEvent.click(screen.getByTestId('coach-menu-trigger'))
            const items = screen.getAllByTestId('coach-history-item')
            expect(items.map((i) => i.textContent)).toEqual(['Pacing talk', 'Hyrox plan'])
            fireEvent.click(within(items[1]!).getByTestId('coach-history-open'))
            expect(loadMessages).toHaveBeenCalledWith('c2')
            expect(screen.queryByTestId('coach-menu')).not.toBeInTheDocument()
            await waitFor(() =>
                expect(screen.getByTestId('coach-history-skeleton')).toBeInTheDocument()
            )
            await act(async () =>
                resolve([{ id: 'm1', role: 'assistant', content: 'Earlier answer', model: null }])
            )
            expect(screen.getByTestId('coach-message-assistant')).toHaveTextContent(
                'Earlier answer'
            )
            expect(screen.queryByTestId('coach-history-skeleton')).not.toBeInTheDocument()
        })

        it('starts a new conversation', async () => {
            const send = vi.fn().mockResolvedValue(streamOf(ndjson(meta, text('a'), done)))
            render(<Harness send={send} conversations={conversations} />)
            fireEvent.click(screen.getAllByTestId('coach-chip')[0]!)
            await waitFor(() =>
                expect(screen.getByTestId('coach-message-assistant')).toBeInTheDocument()
            )
            fireEvent.click(screen.getByTestId('coach-menu-trigger'))
            fireEvent.click(screen.getByTestId('coach-new-conversation'))
            expect(screen.queryByTestId('coach-message-assistant')).not.toBeInTheDocument()
            expect(screen.getByTestId('coach-empty')).toBeInTheDocument()
        })

        it('deletes only after the inline confirmation, and cancel keeps it', () => {
            const onDelete = vi.fn()
            render(<Harness conversations={conversations} onDelete={onDelete} />)
            fireEvent.click(screen.getByTestId('coach-menu-trigger'))
            const first = screen.getAllByTestId('coach-history-item')[0]!
            fireEvent.click(within(first).getByTestId('coach-history-delete'))
            expect(onDelete).not.toHaveBeenCalled()
            fireEvent.click(screen.getByTestId('coach-delete-cancel'))
            expect(onDelete).not.toHaveBeenCalled()
            fireEvent.click(
                within(screen.getAllByTestId('coach-history-item')[0]!).getByTestId(
                    'coach-history-delete'
                )
            )
            fireEvent.click(screen.getByTestId('coach-delete-confirm'))
            expect(onDelete).toHaveBeenCalledWith('c1')
        })

        it('shows loading and empty states', () => {
            const { rerender } = render(<Harness />)
            fireEvent.click(screen.getByTestId('coach-menu-trigger'))
            expect(screen.getByTestId('coach-history-loading')).toBeInTheDocument()
            rerender(<Harness conversations={[]} />)
            expect(screen.getByTestId('coach-history-empty')).toBeInTheDocument()
        })
    })

    describe('model caption and switch note', () => {
        const M1 = 'gemini-3.6-flash'
        const M2 = 'gemini-3-flash-preview'
        const model = (id: string, from: string | null = null) => ({
            type: 'model',
            model: id,
            switchedFrom: from,
        })
        const sendOne = async (...events: object[]) => {
            type(' hi ')
            fireEvent.click(screen.getByTestId('coach-send'))
            await waitFor(() => expect(screen.queryByTestId('coach-stop')).toBeNull())
            return events
        }

        it('shows no caption in a new conversation', () => {
            render(<Harness />)
            expect(screen.queryByTestId('coach-model-caption')).toBeNull()
        })

        it('shows the friendly name and no note for a plain reply', async () => {
            const send = vi
                .fn()
                .mockResolvedValue(streamOf(ndjson(meta, model(M1), text('Hi'), done)))
            render(<Harness send={send} />)
            await sendOne()
            expect(screen.getByTestId('coach-model-caption')).toHaveTextContent('Gemini 3.6 Flash')
            expect(screen.queryByTestId('coach-model-switch-note')).toBeNull()
        })

        it('shows the note right before the switched reply and keeps it out of the caption', async () => {
            const send = vi
                .fn()
                .mockResolvedValue(streamOf(ndjson(meta, model(M2, M1), text('Hi'), done)))
            render(<Harness send={send} />)
            await sendOne()
            const note = screen.getByTestId('coach-model-switch-note')
            expect(note).toHaveTextContent(
                'Gemini 3.6 Flash is not available right now. Answering with Gemini 3 Flash.'
            )
            expect(note).not.toHaveAttribute('role')
            expect(note.nextElementSibling).toBe(screen.getByTestId('coach-message-assistant'))
            const caption = screen.getByTestId('coach-model-caption')
            expect(caption).toHaveTextContent('Gemini 3 Flash')
            expect(caption).not.toHaveTextContent('not available')
            expect(screen.getByTestId('coach-live-region')).not.toHaveTextContent('reached')
        })

        it('shows the note only before the second of two replies', async () => {
            const send = vi
                .fn()
                .mockResolvedValueOnce(streamOf(ndjson(meta, model(M1), text('A'), done)))
                .mockResolvedValueOnce(streamOf(ndjson(meta, model(M2, M1), text('B'), done)))
            render(<Harness send={send} />)
            await sendOne()
            await sendOne()
            const assistants = screen.getAllByTestId('coach-message-assistant')
            expect(assistants).toHaveLength(2)
            const before = assistants[0]?.previousElementSibling
            expect(before instanceof HTMLElement ? before.dataset.testid : null).not.toBe(
                'coach-model-switch-note'
            )
            expect(assistants[1]?.previousElementSibling).toBe(
                screen.getByTestId('coach-model-switch-note')
            )
        })

        it('keeps the caption and shows the error copy when all models fail', async () => {
            const send = vi
                .fn()
                .mockResolvedValueOnce(streamOf(ndjson(meta, model(M1), text('A'), done)))
                .mockResolvedValueOnce(
                    streamOf(ndjson(meta, { type: 'error', kind: 'unavailable' }))
                )
            render(<Harness send={send} />)
            await sendOne()
            fireEvent.change(screen.getByTestId('coach-input'), { target: { value: 'again' } })
            fireEvent.click(screen.getByTestId('coach-send'))
            await waitFor(() => expect(screen.getByTestId('coach-error')).toBeInTheDocument())
            expect(screen.getByTestId('coach-model-caption')).toHaveTextContent('Gemini 3.6 Flash')
        })

        it('shows the raw id of an unknown model', async () => {
            const send = vi
                .fn()
                .mockResolvedValue(streamOf(ndjson(meta, model('mystery-9'), text('Hi'), done)))
            render(<Harness send={send} />)
            await sendOne()
            expect(screen.getByTestId('coach-model-caption')).toHaveTextContent('mystery-9')
        })

        it('uses the last assistant model of a reopened conversation, without a note', async () => {
            const loadMessages = vi.fn().mockResolvedValue([
                { id: 'u', role: 'user', content: 'q', model: null },
                { id: 'a', role: 'assistant', content: 'r', model: M2 },
            ])
            render(
                <Harness
                    conversations={[{ id: 'c1', title: 'T', updatedAt: '2026-01-01T00:00:00Z' }]}
                    loadMessages={loadMessages}
                />
            )
            fireEvent.click(screen.getByTestId('coach-menu-trigger'))
            fireEvent.click(
                within(screen.getAllByTestId('coach-history-item')[0]!).getByTestId(
                    'coach-history-open'
                )
            )
            await waitFor(() =>
                expect(screen.getByTestId('coach-model-caption')).toHaveTextContent(
                    'Gemini 3 Flash'
                )
            )
            expect(screen.queryByTestId('coach-model-switch-note')).toBeNull()
        })

        it('shows no caption and does not crash when stored models are null', async () => {
            const loadMessages = vi
                .fn()
                .mockResolvedValue([{ id: 'a', role: 'assistant', content: 'r', model: null }])
            render(
                <Harness
                    conversations={[{ id: 'c1', title: 'T', updatedAt: '2026-01-01T00:00:00Z' }]}
                    loadMessages={loadMessages}
                />
            )
            fireEvent.click(screen.getByTestId('coach-menu-trigger'))
            fireEvent.click(
                within(screen.getAllByTestId('coach-history-item')[0]!).getByTestId(
                    'coach-history-open'
                )
            )
            await waitFor(() =>
                expect(screen.getByTestId('coach-message-assistant')).toBeInTheDocument()
            )
            expect(screen.queryByTestId('coach-model-caption')).toBeNull()
        })
    })

    describe('voice input', () => {
        const flushVoice = async () => {
            for (let round = 0; round < 6; round += 1) {
                // oxlint-disable-next-line no-await-in-loop -- each round lets one more promise settle
                await act(async () => {})
            }
        }

        const tapMic = async () => {
            fireEvent.click(screen.getByTestId('coach-voice'))
            await flushVoice()
        }

        const connect = (voice: ReturnType<typeof fakeVoiceDeps>) => {
            const socket = voice.sockets[0]
            if (!socket) throw new Error('no socket')
            act(() => {
                socket.open()
                socket.receive(liveMessages.setupComplete)
            })
            return socket
        }

        const speak = (voice: ReturnType<typeof fakeVoiceDeps>) =>
            act(() => voice.audios.at(-1)?.push(new Float32Array(4800).fill(0.25)))

        it('hides the mic button when the browser cannot stream audio', () => {
            render(<Harness voiceDeps={fakeVoiceDeps({ supported: false }).deps} />)
            expect(screen.queryByTestId('coach-voice')).toBeNull()
        })

        it('writes the live text after what was typed and keeps the final text', async () => {
            const send = vi.fn()
            const voice = fakeVoiceDeps()
            render(<Harness send={send} voiceDeps={voice.deps} />)
            type('Plan for')
            await tapMic()
            const socket = connect(voice)
            speak(voice)
            act(() => socket.receive(liveMessages.partial('tomorrow')))
            expect(screen.getByTestId('coach-input')).toHaveValue('Plan for tomorrow')
            act(() => socket.receive(liveMessages.partial("tomorrow's run")))
            expect(screen.getByTestId('coach-input')).toHaveValue("Plan for tomorrow's run")

            await tapMic()
            act(() => socket.receive(liveMessages.final("tomorrow's long run.")))
            await flushVoice()
            expect(screen.getByTestId('coach-input')).toHaveValue("Plan for tomorrow's long run.")
            expect(screen.getByTestId('coach-input')).toHaveFocus()
            expect(send).not.toHaveBeenCalled()
        })

        it('keeps a trailing newline the athlete typed', async () => {
            const voice = fakeVoiceDeps()
            render(<Harness voiceDeps={voice.deps} />)
            type('Week plan:\n')
            await tapMic()
            const socket = connect(voice)
            act(() => socket.receive(liveMessages.partial('easy run')))
            expect(screen.getByTestId('coach-input')).toHaveValue('Week plan:\neasy run')
        })

        it('locks the box while recording and finishing, not after', async () => {
            const voice = fakeVoiceDeps()
            render(<Harness voiceDeps={voice.deps} />)
            expect(screen.getByTestId('coach-input')).not.toHaveAttribute('readonly')
            await tapMic()
            expect(screen.getByTestId('coach-input')).toHaveAttribute('readonly')
            const socket = connect(voice)
            speak(voice)
            await tapMic()
            expect(screen.getByTestId('coach-input')).toHaveAttribute('readonly')
            act(() => socket.receive(liveMessages.final('done')))
            await flushVoice()
            expect(screen.getByTestId('coach-input')).not.toHaveAttribute('readonly')
        })

        it('does not send with the button or Enter while recording', async () => {
            const send = vi.fn()
            const voice = fakeVoiceDeps()
            render(<Harness send={send} voiceDeps={voice.deps} />)
            type('Plan for')
            await tapMic()
            const socket = connect(voice)
            speak(voice)
            act(() => socket.receive(liveMessages.partial('tomorrow')))
            expect(screen.getByTestId('coach-send')).toBeDisabled()
            fireEvent.click(screen.getByTestId('coach-send'))
            fireEvent.keyDown(screen.getByTestId('coach-input'), { key: 'Enter' })
            expect(send).not.toHaveBeenCalled()
            expect(screen.getByTestId('coach-input')).toHaveValue('Plan for tomorrow')
        })

        it('locks the box and sending while the fallback upload runs', async () => {
            const send = vi.fn()
            const pending = deferredResponse()
            const voice = fakeVoiceDeps({ tokenStatus: 502, respond: () => pending.promise })
            render(<Harness send={send} voiceDeps={voice.deps} />)
            type('Plan for')
            await tapMic()
            speak(voice)
            await tapMic()
            expect(screen.getByTestId('coach-voice')).toHaveAttribute('aria-label', 'Transcribing')
            expect(screen.getByTestId('coach-input')).toHaveAttribute('readonly')
            fireEvent.keyDown(screen.getByTestId('coach-input'), { key: 'Enter' })
            expect(send).not.toHaveBeenCalled()
            await act(async () => pending.resolve(Response.json({ text: 'tomorrow' })))
            await flushVoice()
            expect(screen.getByTestId('coach-input')).toHaveValue('Plan for tomorrow')
            expect(screen.getByTestId('coach-input')).not.toHaveAttribute('readonly')
        })

        it('sends the typed text and the transcript to the coach from the panel', async () => {
            const send = vi.fn().mockResolvedValue(streamOf(ndjson(meta, text('a'), done)))
            const voice = fakeVoiceDeps()
            render(<Harness send={send} voiceDeps={voice.deps} />)
            type('Plan for')
            await tapMic()
            const socket = connect(voice)
            speak(voice)
            act(() => socket.receive(liveMessages.partial('tomorrow')))
            fireEvent.click(screen.getByTestId('coach-voice-send'))
            await flushVoice()
            act(() => socket.receive(liveMessages.final('tomorrow.')))
            await flushVoice()
            await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
            expect(send.mock.calls[0]?.[0]).toMatchObject({ message: 'Plan for tomorrow.' })
            expect(screen.getByTestId('coach-input')).toHaveValue('')
        })

        it('keeps the voice text in the box when the coach is still answering', async () => {
            const stream = controlledStream()
            const send = vi.fn().mockResolvedValue(stream.response)
            const voice = fakeVoiceDeps()
            render(<Harness send={send} voiceDeps={voice.deps} />)
            type('hi')
            fireEvent.click(screen.getByTestId('coach-send'))
            await waitFor(() => expect(screen.getByTestId('coach-stop')).toBeInTheDocument())
            type('Plan for')
            await tapMic()
            const socket = connect(voice)
            speak(voice)
            fireEvent.click(screen.getByTestId('coach-voice-send'))
            await flushVoice()
            act(() => socket.receive(liveMessages.final('tomorrow.')))
            await flushVoice()
            expect(send).toHaveBeenCalledTimes(1)
            expect(screen.getByTestId('coach-input')).toHaveValue('Plan for tomorrow.')
        })

        it('sends nothing when the transcription fails', async () => {
            const send = vi.fn()
            const voice = fakeVoiceDeps({
                tokenStatus: 502,
                respond: async () => Response.json({}, { status: 502 }),
            })
            render(<Harness send={send} voiceDeps={voice.deps} />)
            await tapMic()
            speak(voice)
            fireEvent.click(screen.getByTestId('coach-voice-send'))
            await flushVoice()
            expect(send).not.toHaveBeenCalled()
            expect(screen.getByTestId('coach-voice-error')).toHaveTextContent(
                "Couldn't transcribe. Try again."
            )
        })

        it('puts the typed text back when the panel closes while recording', async () => {
            const voice = fakeVoiceDeps()
            render(<Harness voiceDeps={voice.deps} />)
            type('Plan for')
            await tapMic()
            const socket = connect(voice)
            act(() => socket.receive(liveMessages.partial('tomorrow')))
            fireEvent.click(screen.getByTestId('coach-scrim'))
            await flushVoice()
            expect(voice.audios[0]?.released).toBe(true)
            expect(socket.closed).toBe(true)
            expect(voice.transcribe).not.toHaveBeenCalled()
            expect(screen.getByTestId('coach-input')).toHaveValue('Plan for')
        })

        describe('phone panel', () => {
            it('shows the panel with the time, the waveform and three buttons while recording', async () => {
                const voice = fakeVoiceDeps()
                render(<Harness voiceDeps={voice.deps} />)
                expect(screen.queryByTestId('coach-voice-panel')).toBeNull()
                await tapMic()
                connect(voice)
                speak(voice)
                speak(voice)
                expect(screen.getByTestId('coach-voice-panel')).toBeInTheDocument()
                expect(screen.getByTestId('coach-voice-panel-timer')).toHaveTextContent('0:00')
                expect(screen.getAllByTestId('coach-voice-bar')).toHaveLength(2)
                expect(screen.getByTestId('coach-voice-discard')).toBeEnabled()
                expect(screen.getByTestId('coach-voice-pause')).toHaveAttribute(
                    'aria-label',
                    'Pause recording'
                )
                expect(screen.getByTestId('coach-voice-send')).toBeEnabled()
            })

            it('hides the row mic and Send on phones while recording', async () => {
                const voice = fakeVoiceDeps()
                render(<Harness voiceDeps={voice.deps} />)
                expect(screen.getByTestId('coach-compose-actions')).not.toHaveClass('max-md:hidden')
                await tapMic()
                expect(screen.getByTestId('coach-compose-actions')).toHaveClass('max-md:hidden')
                fireEvent.click(screen.getByTestId('coach-voice-discard'))
                await flushVoice()
                expect(screen.getByTestId('coach-compose-actions')).not.toHaveClass('max-md:hidden')
            })

            it('pauses and resumes from the panel', async () => {
                const voice = fakeVoiceDeps()
                render(<Harness voiceDeps={voice.deps} />)
                await tapMic()
                fireEvent.click(screen.getByTestId('coach-voice-pause'))
                expect(screen.getByTestId('coach-voice-pause')).toHaveAttribute(
                    'aria-label',
                    'Resume recording'
                )
                fireEvent.click(screen.getByTestId('coach-voice-pause'))
                expect(screen.getByTestId('coach-voice-pause')).toHaveAttribute(
                    'aria-label',
                    'Pause recording'
                )
            })

            it('discards from the panel and restores the typed text', async () => {
                const voice = fakeVoiceDeps()
                render(<Harness voiceDeps={voice.deps} />)
                type('Plan for')
                await tapMic()
                const socket = connect(voice)
                act(() => socket.receive(liveMessages.partial('x')))
                fireEvent.click(screen.getByTestId('coach-voice-discard'))
                await flushVoice()
                expect(screen.getByTestId('coach-input')).toHaveValue('Plan for')
                expect(screen.queryByTestId('coach-voice-panel')).toBeNull()
            })

            it('disables send while the microphone starts and spins while finishing', async () => {
                const voice = fakeVoiceDeps({ pendingAudio: true })
                render(<Harness voiceDeps={voice.deps} />)
                await tapMic()
                expect(screen.getByTestId('coach-voice-send')).toBeDisabled()
                await act(async () => voice.resolveAudio(0))
                await flushVoice()
                connect(voice)
                speak(voice)
                fireEvent.click(screen.getByTestId('coach-voice-send'))
                await flushVoice()
                expect(screen.getByTestId('coach-voice-send')).toBeDisabled()
                expect(screen.getByTestId('coach-voice-send-spinner')).toBeInTheDocument()
            })

            it('is the last thing in the panel so the safe area pads the screen bottom', async () => {
                const send = vi
                    .fn()
                    .mockResolvedValue(
                        streamOf(
                            ndjson(
                                meta,
                                { type: 'model', model: 'gemini-3.6-flash', switchedFrom: null },
                                text('Hi'),
                                done
                            )
                        )
                    )
                const voice = fakeVoiceDeps()
                render(<Harness send={send} voiceDeps={voice.deps} />)
                type('hi')
                fireEvent.click(screen.getByTestId('coach-send'))
                await waitFor(() =>
                    expect(screen.getByTestId('coach-model-caption')).toBeInTheDocument()
                )
                await tapMic()
                const panel = screen.getByTestId('coach-voice-panel')
                expect(panel.nextElementSibling).toBeNull()
                expect(
                    screen.getByTestId('coach-model-caption').compareDocumentPosition(panel) &
                        Node.DOCUMENT_POSITION_FOLLOWING
                ).toBeTruthy()
            })

            it('releases everything when the chat closes while paused', async () => {
                const voice = fakeVoiceDeps()
                render(<Harness voiceDeps={voice.deps} />)
                type('Plan for')
                await tapMic()
                const socket = connect(voice)
                act(() => socket.receive(liveMessages.partial('x')))
                fireEvent.click(screen.getByTestId('coach-voice-pause'))
                fireEvent.click(screen.getByTestId('coach-scrim'))
                await flushVoice()
                expect(voice.audios[0]?.released).toBe(true)
                expect(socket.closed).toBe(true)
                expect(screen.getByTestId('coach-input')).toHaveValue('Plan for')
            })
        })

        it('shows the button states, the timer and a stop icon unlike the reply Stop', async () => {
            vi.useFakeTimers()
            try {
                const voice = fakeVoiceDeps({ pendingAudio: true })
                render(<Harness voiceDeps={voice.deps} />)
                expect(screen.getByTestId('coach-voice')).toHaveAttribute(
                    'aria-label',
                    'Record a voice message'
                )

                await tapMic()
                expect(screen.getByTestId('coach-voice')).toHaveAttribute(
                    'aria-label',
                    'Waiting for the microphone'
                )
                expect(screen.getByTestId('coach-voice')).toBeEnabled()

                await act(async () => voice.resolveAudio(0))
                await flushVoice()
                act(() => vi.advanceTimersByTime(3000))
                expect(screen.getByTestId('coach-voice-timer')).toHaveTextContent('0:03')
                expect(screen.getByTestId('coach-voice')).toHaveAttribute(
                    'aria-label',
                    'Stop recording'
                )
                expect(screen.getByTestId('coach-voice-stop-icon')).toBeInTheDocument()

                connect(voice)
                speak(voice)
                await tapMic()
                expect(screen.getByTestId('coach-voice')).toBeDisabled()
                expect(screen.getByTestId('coach-voice')).toHaveAttribute(
                    'aria-label',
                    'Transcribing'
                )
                expect(screen.queryByTestId('coach-voice-timer')).toBeNull()
            } finally {
                vi.useRealTimers()
            }
        })

        it.each([
            [
                'busy',
                { tokenStatus: 502, respond: async () => Response.json({}, { status: 429 }) },
                'Transcription is busy. Try again in a minute.',
            ],
            [
                'failed',
                { tokenStatus: 502, respond: async () => Response.json({}, { status: 502 }) },
                "Couldn't transcribe. Try again.",
            ],
            [
                'no-speech',
                { tokenStatus: 502, respond: async () => Response.json({ text: '' }) },
                "Didn't catch that. Try again.",
            ],
        ])('shows the %s copy', async (_kind, options, copy) => {
            const voice = fakeVoiceDeps(options)
            render(<Harness voiceDeps={voice.deps} />)
            await tapMic()
            speak(voice)
            await tapMic()
            await waitFor(() =>
                expect(screen.getByTestId('coach-voice-error')).toHaveTextContent(copy)
            )
        })

        it('keeps the error line out of the row that centers the buttons on the box', async () => {
            const voice = fakeVoiceDeps({ openError: permissionDenied() })
            render(<Harness voiceDeps={voice.deps} />)
            await tapMic()
            const row = screen.getByTestId('coach-compose-row')
            expect(row).toContainElement(screen.getByTestId('coach-input'))
            expect(row).toContainElement(screen.getByTestId('coach-send'))
            expect(row).not.toContainElement(screen.getByTestId('coach-voice-error'))
        })

        it('shows the blocked microphone copy', async () => {
            const voice = fakeVoiceDeps({ openError: permissionDenied() })
            render(<Harness voiceDeps={voice.deps} />)
            await tapMic()
            expect(screen.getByTestId('coach-voice-error')).toHaveTextContent(
                'Allow microphone access in your browser settings'
            )
        })

        it('records while the coach is answering', async () => {
            const stream = controlledStream()
            const send = vi.fn().mockResolvedValue(stream.response)
            const voice = fakeVoiceDeps()
            render(<Harness send={send} voiceDeps={voice.deps} />)
            type('hi')
            fireEvent.click(screen.getByTestId('coach-send'))
            await waitFor(() => expect(screen.getByTestId('coach-stop')).toBeInTheDocument())
            await tapMic()
            expect(screen.getByTestId('coach-voice')).toHaveAttribute(
                'aria-label',
                'Stop recording'
            )
        })
    })
})
