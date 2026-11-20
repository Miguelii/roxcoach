import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CoachChatView } from '@/modules/coach/coach-chat-view'
import { COACH_SUGGESTIONS } from '@/modules/coach/suggestions'
import { useCoachChat, type SendBody } from '@/modules/coach/use-coach-chat'
import { controlledStream, jsonStatus, ndjson, streamOf } from '@/modules/coach/__tests__/helpers'

const ID = '11111111-1111-4111-8111-111111111111'
const meta = { type: 'meta', conversationId: ID }
const text = (delta: string) => ({ type: 'text', delta })
const done = { type: 'done' }

type HarnessProps = {
    send?: (body: SendBody, signal: AbortSignal) => Promise<Response>
    loadMessages?: (
        id: string
    ) => Promise<{ id: string; role: 'user' | 'assistant'; content: string }[]>
    conversations?: { id: string; title: string; updatedAt: string }[]
    onDelete?: (id: string) => void
    startOpen?: boolean
}

function Harness({
    send,
    loadMessages,
    conversations,
    onDelete = () => {},
    startOpen = true,
}: HarnessProps) {
    const chat = useCoachChat({ send, loadMessages })
    return <HarnessView {...{ chat, conversations, onDelete, startOpen }} />
}

import { useState } from 'react'
function HarnessView({
    chat,
    conversations,
    onDelete,
    startOpen,
}: {
    chat: ReturnType<typeof useCoachChat>
    conversations: HarnessProps['conversations']
    onDelete: (id: string) => void
    startOpen: boolean
}) {
    const [open, setOpen] = useState(startOpen)
    return (
        <CoachChatView
            open={open}
            onOpenChange={setOpen}
            messages={chat.messages}
            status={chat.status}
            errorKind={chat.errorKind}
            conversationId={chat.conversationId}
            conversations={conversations}
            chips={COACH_SUGGESTIONS}
            onSend={chat.sendMessage}
            onStop={chat.stop}
            onNew={chat.newConversation}
            onOpen={(id) => void chat.openConversation(id)}
            onDelete={onDelete}
            onRetry={chat.retry}
        />
    )
}

const type = (value: string) =>
    fireEvent.change(screen.getByTestId('coach-input'), { target: { value } })

describe('CoachChatView', () => {
    it('shows the launcher bar and opens the panel, focusing the input', () => {
        render(<Harness startOpen={false} />)
        expect(screen.queryByTestId('coach-panel')).not.toBeInTheDocument()
        fireEvent.click(screen.getByTestId('coach-launcher'))
        expect(screen.getByTestId('coach-panel')).toBeInTheDocument()
        expect(screen.getByTestId('coach-input')).toHaveFocus()
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
            /microphone|voice|mic\b/
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
            expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript:/i)
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
        it('is a full-height container on narrow screens and a fixed bottom-right panel from md', () => {
            render(<Harness />)
            const panel = screen.getByTestId('coach-panel')
            expect(panel).toHaveClass('fixed', 'inset-0')
            expect(panel).toHaveClass('md:right-4', 'md:bottom-4', 'md:inset-auto')
        })
    })

    describe('history menu', () => {
        const conversations = [
            { id: 'c1', title: 'Pacing talk', updatedAt: '2026-11-19T10:00:00Z' },
            { id: 'c2', title: 'Hyrox plan', updatedAt: '2026-11-18T10:00:00Z' },
        ]

        it('lists conversations and opens one, loading its messages with a skeleton', async () => {
            let resolve!: (v: { id: string; role: 'user' | 'assistant'; content: string }[]) => void
            const loadMessages = vi.fn().mockImplementation(() => new Promise((r) => (resolve = r)))
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
                resolve([{ id: 'm1', role: 'assistant', content: 'Earlier answer' }])
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
})
