import { MessageCircleIcon, SendIcon, SquareIcon, XIcon } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { CoachHistoryMenu, type ConversationSummary } from '@/modules/coach/coach-history-menu'
import { CoachModelCaption } from '@/modules/coach/coach-model-caption'
import { CoachModelSwitchNote } from '@/modules/coach/coach-model-switch-note'
import { CoachMessage } from '@/modules/coach/coach-message'
import { COACH_MESSAGE_MAX_CHARS } from '@/modules/coach/suggestions'
import {
    type ChatErrorKind,
    type ChatMessage,
    type ChatStatus,
} from '@/modules/coach/use-coach-chat'
import { useCoachComposer } from '@/modules/coach/use-coach-composer'

type Props = {
    open: boolean
    onOpenChange: (open: boolean) => void
    launcherEnabled: boolean
    onDismissLauncher: () => void
    messages: ChatMessage[]
    status: ChatStatus
    errorKind: ChatErrorKind | null
    conversationId: string | null
    modelId: string | null
    conversations: ConversationSummary[] | undefined
    chips: readonly string[]
    onSend: (text: string) => void
    onStop: () => void
    onNew: () => void
    onOpen: (id: string) => void
    onDelete: (id: string) => void
    onRetry: () => void
}

const ERROR_COPY: Record<ChatErrorKind, string> = {
    busy: 'The coach is busy, try again in a minute',
    blocked: 'The coach cannot answer that. Try rephrasing.',
    'sign-in': 'Your session ended. Sign in again to keep chatting.',
    'not-configured': 'The coach is not set up yet',
    'not-found': 'That conversation no longer exists. Retry to start a new one.',
    history: 'Could not load that conversation.',
    limit: "You reached today's message limit",
}

const RETRYABLE = new Set<ChatErrorKind>(['busy', 'not-found'])
const NEAR_LIMIT = COACH_MESSAGE_MAX_CHARS - 200
// Within this distance from the bottom the list keeps following new text.
const STICK_PX = 48

export function CoachChatView(props: Props) {
    const { open, onOpenChange, status, errorKind, launcherEnabled, onDismissLauncher } = props

    if (!open) {
        if (!launcherEnabled) return null
        // On mobile the coach opens from the bottom nav, so the bar only shows from md up.
        return (
            // A bezel (the outer ring) around a dark core, so the bar stands out from the page.
            <div className="fixed bottom-4 left-1/2 z-30 hidden w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 rounded-full bg-ink/10 p-1.5 ring-1 ring-ink/10 shadow-[0_18px_40px_-12px_color-mix(in_srgb,var(--color-ink)_55%,transparent)] md:block">
                <div className="group flex h-14 items-center rounded-full bg-ink text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5">
                    <button
                        type="button"
                        data-testid="coach-launcher"
                        onClick={() => onOpenChange(true)}
                        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-full pl-2.5 text-left text-sm font-medium transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
                    >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105">
                            <MessageCircleIcon className="size-4" strokeWidth={1.75} />
                        </span>
                        <span className="truncate">Ask Migueli Coach...</span>
                    </button>
                    <button
                        type="button"
                        data-testid="coach-launcher-dismiss"
                        aria-label="Hide coach bar"
                        onClick={onDismissLauncher}
                        className="mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-primary-foreground/70 transition-colors duration-300 hover:bg-primary-foreground/15 hover:text-primary-foreground"
                    >
                        <XIcon className="size-4" />
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div
            role="dialog"
            aria-label="Coach chat"
            data-testid="coach-panel"
            onKeyDown={(event) => {
                if (event.key === 'Escape') onOpenChange(false)
            }}
            // Full height on narrow screens, a fixed bottom-right panel from md up.
            className={cn(
                'fixed inset-0 z-50 flex flex-col bg-paper text-ink',
                'md:inset-auto md:right-4 md:bottom-4 md:h-[36rem] md:max-h-[calc(100dvh-2rem)] md:w-[26rem]',
                'md:rounded-[var(--radius-surface)] md:border md:border-hairline md:shadow-lg'
            )}
        >
            <PanelBody {...props} errorKind={errorKind} status={status} />
        </div>
    )
}

function PanelBody({
    onOpenChange,
    messages,
    status,
    errorKind,
    conversationId,
    modelId,
    conversations,
    chips,
    onSend,
    onStop,
    onNew,
    onOpen,
    onDelete,
    onRetry,
}: Props) {
    const { form, submit } = useCoachComposer({ onSend })
    // useWatch, not form.watch: the React Compiler memoizes watch() and the Send button would stay
    // disabled while typing.
    const text = useWatch({ control: form.control, name: 'message' })
    const streaming = status === 'streaming'
    const canSend = !streaming && text.trim() !== '' && text.length <= COACH_MESSAGE_MAX_CHARS

    const inputRef = useRef<HTMLTextAreaElement | null>(null)
    const listRef = useRef<HTMLDivElement | null>(null)
    const stickRef = useRef(true)
    const [previousStatus, setPreviousStatus] = useState<ChatStatus>(status)
    const [announcement, setAnnouncement] = useState('')

    useEffect(() => inputRef.current?.focus(), [])

    // Follows the newest text unless the athlete scrolled up.
    useEffect(() => {
        const list = listRef.current
        if (list && stickRef.current) list.scrollTop = list.scrollHeight
    }, [messages])

    // Screen readers hear the reply once, when it finishes, not every delta.
    if (previousStatus !== status) {
        setPreviousStatus(status)
        if (status === 'streaming') setAnnouncement('')
        else if (previousStatus === 'streaming') {
            const last = messages.at(-1)
            setAnnouncement(last?.role === 'assistant' ? last.content : '')
        }
    }

    const empty = messages.length === 0 && status !== 'loading-history'

    return (
        <>
            <header className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
                <h2 data-testid="coach-title" className="display flex-1 text-xl">
                    Migueli coach
                </h2>
                <CoachHistoryMenu
                    conversations={conversations}
                    currentId={conversationId}
                    onNew={onNew}
                    onOpen={onOpen}
                    onDelete={onDelete}
                />
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close chat"
                    data-testid="coach-close"
                    onClick={() => onOpenChange(false)}
                >
                    <XIcon />
                </Button>
            </header>

            <div
                ref={listRef}
                data-testid="coach-messages"
                aria-busy={streaming}
                onScroll={(event) => {
                    const el = event.currentTarget
                    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX
                }}
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
            >
                {status === 'loading-history' ? (
                    <div data-testid="coach-history-skeleton" className="space-y-3">
                        <Skeleton className="h-10 w-2/3" />
                        <Skeleton className="ml-auto h-10 w-1/2" />
                        <Skeleton className="h-16 w-3/4" />
                    </div>
                ) : null}
                {empty ? (
                    <div data-testid="coach-empty" className="space-y-4">
                        <p data-testid="coach-greeting" className="text-sm text-muted-foreground">
                            Hi, I am your coach. Ask me about your training, your races or what to
                            do next.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {chips.map((chip) => (
                                <Button
                                    key={chip}
                                    variant="outline"
                                    size="sm"
                                    data-testid="coach-chip"
                                    onClick={() => onSend(chip)}
                                >
                                    {chip}
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : null}
                {messages.map((message) => (
                    <Fragment key={message.id}>
                        {message.switchNote ? (
                            <CoachModelSwitchNote
                                from={message.switchNote.from}
                                to={message.switchNote.to}
                            />
                        ) : null}
                        <CoachMessage message={message} />
                    </Fragment>
                ))}
                {streaming && messages.at(-1)?.content === '' ? (
                    <p data-testid="coach-thinking" className="text-sm text-muted-foreground">
                        Thinking...
                    </p>
                ) : null}
                {errorKind ? (
                    <div
                        role="alert"
                        data-testid={errorKind === 'limit' ? 'coach-limit' : 'coach-error'}
                        className="flex items-center gap-3 rounded-[var(--radius-surface)] border border-hairline bg-muted p-3 text-sm"
                    >
                        <span data-testid="coach-error-text" className="flex-1">
                            {ERROR_COPY[errorKind]}
                        </span>
                        {RETRYABLE.has(errorKind) ? (
                            <Button size="sm" data-testid="coach-retry" onClick={onRetry}>
                                Retry
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <div data-testid="coach-live-region" aria-live="polite" className="sr-only">
                {announcement}
            </div>

            <Form {...form}>
                <form
                    onSubmit={(event) => {
                        event.preventDefault()
                        submit(streaming)
                    }}
                    className="flex items-center gap-2 border-t border-hairline p-3"
                >
                    <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                            <FormItem className="min-w-0 flex-1">
                                <FormControl>
                                    <Textarea
                                        {...field}
                                        ref={(node) => {
                                            field.ref(node)
                                            inputRef.current = node
                                        }}
                                        rows={2}
                                        aria-label="Message to Migueli Coach"
                                        placeholder="Ask Migueli Coach..."
                                        data-testid="coach-input"
                                        className="min-h-0 max-h-32"
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'Enter' &&
                                                !event.shiftKey &&
                                                !event.nativeEvent.isComposing
                                            ) {
                                                event.preventDefault()
                                                submit(streaming)
                                            }
                                        }}
                                    />
                                </FormControl>
                                {text.length >= NEAR_LIMIT ? (
                                    <p
                                        data-testid="coach-char-count"
                                        className={cn(
                                            'text-xs text-muted-foreground',
                                            text.length > COACH_MESSAGE_MAX_CHARS &&
                                                'text-destructive'
                                        )}
                                    >
                                        {text.length}/{COACH_MESSAGE_MAX_CHARS}
                                    </p>
                                ) : null}
                                <FormMessage data-testid="coach-input-error" />
                            </FormItem>
                        )}
                    />
                    {streaming ? (
                        <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label="Stop"
                            data-testid="coach-stop"
                            onClick={onStop}
                        >
                            <SquareIcon />
                        </Button>
                    ) : null}
                    <Button
                        type="submit"
                        size="icon"
                        aria-label="Send"
                        data-testid="coach-send"
                        disabled={!canSend}
                    >
                        <SendIcon />
                    </Button>
                </form>
            </Form>
            <CoachModelCaption modelId={modelId} />
        </>
    )
}
