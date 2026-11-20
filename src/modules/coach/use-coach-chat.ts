import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { COACH_MESSAGE_MAX_CHARS } from '@/modules/coach/suggestions'

export type ChatMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    // True for a reply that was cut off (stopped, failed or the connection dropped).
    incomplete?: boolean
    // Set on a reply that came from a fallback model: the list shows a note before it.
    // In-session only, never stored.
    switchNote?: { from: string; to: string }
}

export type ChatStatus = 'idle' | 'loading-history' | 'streaming' | 'error' | 'limit'

export type ChatErrorKind =
    | 'busy'
    | 'blocked'
    | 'sign-in'
    | 'not-configured'
    | 'not-found'
    | 'history'
    | 'limit'

export type SendBody = { conversationId: string | null; message: string }

type StoredMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    model: string | null
}

type Options = {
    send?: (body: SendBody, signal: AbortSignal) => Promise<Response>
    loadMessages?: (conversationId: string) => Promise<StoredMessage[]>
    // Called after every completed reply (the wrapper refreshes the conversation list).
    onReply?: () => void
}

const eventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('meta'), conversationId: z.string() }),
    z.object({
        type: z.literal('model'),
        model: z.string(),
        switchedFrom: z.string().nullable(),
    }),
    z.object({ type: z.literal('text'), delta: z.string() }),
    z.object({ type: z.literal('done') }),
    z.object({
        type: z.literal('error'),
        kind: z.enum(['rate_limited', 'unavailable', 'blocked']),
    }),
])

type StreamEvent = z.infer<typeof eventSchema>

// The terminal event of a stream, set by the line handler.
type Outcome = { end: StreamEvent | null }

const defaultSend = (body: SendBody, signal: AbortSignal) =>
    fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
    })

// Parses one NDJSON line. Null for blank lines, invalid JSON and unknown event types.
const parseLine = (line: string): StreamEvent | null => {
    if (line.trim() === '') return null
    try {
        const parsed = eventSchema.safeParse(JSON.parse(line))
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

const httpErrorKind = (status: number): ChatErrorKind => {
    if (status === 429) return 'limit'
    if (status === 401 || status === 403) return 'sign-in'
    if (status === 404) return 'not-found'
    if (status === 503) return 'not-configured'
    return 'busy'
}

export function useCoachChat({ send = defaultSend, loadMessages, onReply }: Options = {}) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [status, setStatus] = useState<ChatStatus>('idle')
    const [errorKind, setErrorKind] = useState<ChatErrorKind | null>(null)
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [modelId, setModelId] = useState<string | null>(null)

    const busyRef = useRef(false)
    const generationRef = useRef(0)
    const controllerRef = useRef<AbortController | null>(null)
    const conversationRef = useRef<string | null>(null)
    const lastTextRef = useRef<string | null>(null)
    const idRef = useRef(0)
    const optionsRef = useRef({ send, loadMessages, onReply })
    useEffect(() => {
        optionsRef.current = { send, loadMessages, onReply }
    })

    const nextId = () => `local-${(idRef.current += 1)}`

    // Invalidates every in-flight request: their late events and results are ignored.
    const supersede = useCallback(() => {
        generationRef.current += 1
        controllerRef.current?.abort()
        controllerRef.current = null
        busyRef.current = false
    }, [])

    useEffect(() => supersede, [supersede])

    const setConversation = (id: string | null) => {
        conversationRef.current = id
        setConversationId(id)
    }

    const run = async (text: string, reuseUser: boolean) => {
        if (busyRef.current) return
        busyRef.current = true
        const generation = ++generationRef.current
        const controller = new AbortController()
        controllerRef.current = controller
        lastTextRef.current = text
        const alive = () => generationRef.current === generation

        const assistantId = nextId()
        setMessages((current) => {
            const base = reuseUser
                ? current.filter((message) => !(message.role === 'assistant' && message.incomplete))
                : [...current, { id: nextId(), role: 'user' as const, content: text }]
            return [...base, { id: assistantId, role: 'assistant', content: '' }]
        })
        setStatus('streaming')
        setErrorKind(null)

        // Drops an empty bubble, marks a partial one incomplete.
        const settle = (incomplete: boolean) =>
            setMessages((current) =>
                current.flatMap((message) => {
                    if (message.id !== assistantId) return [message]
                    if (message.content === '') return []
                    return [incomplete ? { ...message, incomplete: true } : message]
                })
            )
        const fail = (kind: ChatErrorKind, incomplete: boolean) => {
            settle(incomplete)
            setErrorKind(kind)
            setStatus(kind === 'limit' ? 'limit' : 'error')
        }

        try {
            let response: Response
            try {
                response = await optionsRef.current.send(
                    { conversationId: conversationRef.current, message: text },
                    controller.signal
                )
            } catch {
                if (!alive()) return
                if (controller.signal.aborted) {
                    settle(true)
                    setStatus('idle')
                } else fail('busy', false)
                return
            }
            if (!alive()) return
            if (response.status !== 200) {
                if (response.status === 404) setConversation(null)
                fail(httpErrorKind(response.status), false)
                return
            }
            const reader = response.body?.getReader()
            if (!reader) {
                fail('busy', true)
                return
            }
            const onAbort = () => void reader.cancel().catch(() => undefined)
            controller.signal.addEventListener('abort', onAbort)

            const decoder = new TextDecoder()
            let buffer = ''
            const outcome: Outcome = { end: null }
            // The announced model becomes the caption once its first text arrives, so a
            // stream that fails right after the event keeps the previous caption.
            let pendingModel: string | null = null
            const handle = (line: string) => {
                const event = parseLine(line)
                if (!event || outcome.end) return
                if (event.type === 'meta') setConversation(event.conversationId)
                else if (event.type === 'model') {
                    pendingModel = event.model
                    const { switchedFrom } = event
                    if (switchedFrom !== null)
                        setMessages((current) =>
                            current.map((message) =>
                                message.id === assistantId
                                    ? {
                                          ...message,
                                          switchNote: { from: switchedFrom, to: event.model },
                                      }
                                    : message
                            )
                        )
                } else if (event.type === 'text') {
                    if (pendingModel !== null) {
                        setModelId(pendingModel)
                        pendingModel = null
                    }
                    setMessages((current) =>
                        current.map((message) =>
                            message.id === assistantId
                                ? { ...message, content: message.content + event.delta }
                                : message
                        )
                    )
                } else outcome.end = event
            }

            try {
                for (;;) {
                    const { done, value } = await reader.read()
                    if (!alive()) {
                        void reader.cancel().catch(() => undefined)
                        return
                    }
                    if (done) break
                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() ?? ''
                    for (const line of lines) handle(line)
                }
                buffer += decoder.decode()
                handle(buffer)
            } catch {
                if (!alive()) return
                if (!controller.signal.aborted) {
                    fail('busy', true)
                    return
                }
            } finally {
                controller.signal.removeEventListener('abort', onAbort)
            }
            if (!alive()) return

            if (controller.signal.aborted) {
                settle(true)
                setStatus('idle')
                return
            }
            const { end } = outcome
            if (end?.type === 'done') {
                settle(false)
                setStatus('idle')
                optionsRef.current.onReply?.()
            } else if (end?.type === 'error') {
                fail(end.kind === 'blocked' ? 'blocked' : 'busy', true)
            } else fail('busy', true)
        } finally {
            if (alive()) {
                busyRef.current = false
                controllerRef.current = null
            }
        }
    }

    const sendMessage = (text: string) => {
        const trimmed = text.trim()
        if (trimmed === '' || trimmed.length > COACH_MESSAGE_MAX_CHARS) return
        void run(trimmed, false)
    }

    const retry = () => {
        const text = lastTextRef.current
        if (text === null || status !== 'error') return
        if (errorKind !== 'busy' && errorKind !== 'not-found') return
        void run(text, true)
    }

    const stop = () => controllerRef.current?.abort()

    const reset = () => {
        supersede()
        setMessages([])
        setStatus('idle')
        setErrorKind(null)
        setModelId(null)
        lastTextRef.current = null
    }

    const newConversation = () => {
        reset()
        setConversation(null)
    }

    const openConversation = async (id: string) => {
        reset()
        setConversation(id)
        const load = optionsRef.current.loadMessages
        if (!load) return
        const generation = generationRef.current
        setStatus('loading-history')
        try {
            const stored = await load(id)
            if (generationRef.current !== generation) return
            setModelId(
                stored.findLast((message) => message.role === 'assistant' && message.model !== null)
                    ?.model ?? null
            )
            setMessages(
                stored.map(({ id: messageId, role, content }) => ({
                    id: messageId,
                    role,
                    content,
                }))
            )
            setStatus('idle')
        } catch {
            if (generationRef.current !== generation) return
            setErrorKind('history')
            setStatus('error')
        }
    }

    return {
        messages,
        status,
        errorKind,
        conversationId,
        modelId,
        sendMessage,
        stop,
        newConversation,
        openConversation,
        retry,
    }
}
