/* oxlint-disable max-lines -- the chat panel and its message list share state */
import { MessageCircleIcon, SendIcon, SquareIcon, XIcon } from 'lucide-react'
import { Fragment, type PropsWithChildren, useEffect, useRef, useState } from 'react'
import { useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { CoachHistoryMenu, type ConversationSummary } from '@/modules/coach/coach-history-menu'
import { CoachModelCaption } from '@/modules/coach/coach-model-caption'
import { CoachModelSwitchNote } from '@/modules/coach/coach-model-switch-note'
import { CoachMessage, preloadCoachMarkdown } from '@/modules/coach/coach-message'
import { COACH_MESSAGE_MAX_CHARS } from '@/modules/coach/suggestions'
import {
    type ChatErrorKind,
    type ChatMessage,
    type ChatStatus,
} from '@/modules/coach/use-coach-chat'
import { useCoachComposer } from '@/modules/coach/use-coach-composer'
import { CoachVoiceButton, CoachVoiceError } from '@/modules/coach/coach-voice-button'
import { CoachVoicePanel } from '@/modules/coach/coach-voice-panel'
import { useVoiceRecorder, type VoiceDeps } from '@/modules/coach/use-voice-recorder'
import { useLockPageScroll, useVisualViewport } from '@/modules/coach/use-visual-viewport'

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
    voiceDeps?: VoiceDeps
}

type FrameProps = PropsWithChildren<
    Pick<Props, 'open' | 'onOpenChange'> & {
        onExited: () => void
    }
>

type LauncherProps = Pick<Props, 'onOpenChange' | 'onDismissLauncher'>

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
// Unmounts a closing panel even when no transition fires (it would otherwise stay invisible on top).
const EXIT_FALLBACK_MS = 600

export function CoachChatView(props: Props) {
    const { open, onOpenChange, status, errorKind, launcherEnabled, onDismissLauncher } = props
    const [rendered, setRendered] = useState(open)
    if (open && !rendered) setRendered(true)

    // Escape closes the panel wherever the focus is, not only inside it. An Escape that something
    // inside already handled (an open menu) is left to that thing.
    useEffect(() => {
        if (!open) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) onOpenChange(false)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [open, onOpenChange])

    useEffect(() => {
        if (open || !rendered) return
        const timer = setTimeout(() => setRendered(false), EXIT_FALLBACK_MS)
        return () => clearTimeout(timer)
    }, [open, rendered])

    const showLauncher = !open && launcherEnabled
    if (!showLauncher && !rendered) return null

    return (
        <>
            {showLauncher && (
                <CoachLauncher onOpenChange={onOpenChange} onDismissLauncher={onDismissLauncher} />
            )}
            {rendered && (
                <CoachPanelFrame
                    open={open}
                    onOpenChange={onOpenChange}
                    onExited={() => setRendered(false)}
                >
                    <PanelBody {...props} errorKind={errorKind} status={status} />
                </CoachPanelFrame>
            )}
        </>
    )
}

// On mobile the coach opens from the bottom nav, so the bar only shows from md up.
function CoachLauncher({ onOpenChange, onDismissLauncher }: LauncherProps) {
    return (
        // A white bar in a faint bezel with a soft shadow: it lifts off the page without shouting.
        <div className="fixed bottom-4 left-1/2 z-30 hidden w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 rounded-full bg-ink/5 p-1.5 shadow-[0_14px_32px_-14px_color-mix(in_srgb,var(--color-ink)_35%,transparent)] md:block">
            <div className="group flex h-12 items-center rounded-full bg-card text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5">
                <button
                    type="button"
                    data-testid="coach-launcher"
                    onClick={() => onOpenChange(true)}
                    onPointerEnter={preloadCoachMarkdown}
                    onFocus={preloadCoachMarkdown}
                    className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-full pl-2 text-left text-sm text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
                >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signal/10 text-signal-strong transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105">
                        <MessageCircleIcon className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="truncate">Ask Migueli Coach...</span>
                </button>
                <button
                    type="button"
                    data-testid="coach-launcher-dismiss"
                    aria-label="Hide coach bar"
                    onClick={onDismissLauncher}
                    className="mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-300 hover:bg-muted hover:text-foreground"
                >
                    <XIcon className="size-4" />
                </button>
            </div>
        </div>
    )
}

// Full screen on a phone; from md up a centered dialog over a soft scrim. Clicking the scrim (not
// the panel) closes it. The frame follows the visible viewport, so with the iOS keyboard open the
// panel still fills exactly the screen above it, and the page behind does not scroll.
function CoachPanelFrame({ open, onOpenChange, onExited, children }: FrameProps) {
    const viewport = useVisualViewport()
    useLockPageScroll()
    const state = open ? 'open' : 'closed'

    return (
        <div
            data-testid="coach-scrim"
            data-state={state}
            className={cn(
                'fixed inset-0 z-50 md:flex md:items-center md:justify-center md:p-6',
                'data-[state=closed]:pointer-events-none'
            )}
            style={
                viewport === null
                    ? undefined
                    : { top: viewport.offsetTop, height: viewport.height, bottom: 'auto' }
            }
            onClick={(event) => {
                if (event.target === event.currentTarget) onOpenChange(false)
            }}
        >
            <div
                aria-hidden="true"
                data-state={state}
                className={cn(
                    'pointer-events-none absolute inset-0 hidden bg-ink/30 md:block',
                    'transition-opacity duration-400 ease-out-strong starting:opacity-0',
                    'data-[state=closed]:opacity-0 data-[state=closed]:duration-250'
                )}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Coach chat"
                data-testid="coach-panel"
                data-state={state}
                inert={!open}
                onTransitionEnd={(event) => {
                    if (event.target === event.currentTarget && !open) onExited()
                }}
                className={cn(
                    'relative flex h-full w-full flex-col bg-paper text-ink',
                    'transition-[translate,opacity] duration-500 ease-spring md:duration-400',
                    'starting:translate-y-full md:starting:translate-y-10 md:starting:opacity-0',
                    'data-[state=closed]:translate-y-full data-[state=closed]:duration-300',
                    'md:data-[state=closed]:translate-y-10 md:data-[state=closed]:opacity-0 md:data-[state=closed]:duration-250',
                    'md:h-[42rem] md:max-h-full md:max-w-[46rem]',
                    'md:rounded-[var(--radius-surface)] md:border md:border-hairline md:shadow-[0_30px_80px_-30px_color-mix(in_srgb,var(--color-ink)_50%,transparent)]'
                )}
            >
                {children}
            </div>
        </div>
    )
}

function PanelBody({
    open,
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
    voiceDeps,
}: Props) {
    const streaming = status === 'streaming'
    const { form, submit, voiceTarget } = useCoachComposer({ onSend, streaming })
    const voice = useVoiceRecorder({ deps: voiceDeps, target: voiceTarget })
    // Voice text lands in the box until the recording settles, so sending in between would bring
    // the sent text back. Typing stays open only while the microphone is starting.
    const voiceActive = voice.state !== 'idle'
    const voiceWriting = voiceActive && voice.state !== 'starting'
    const { cancel: cancelVoice } = voice
    // useWatch, not form.watch: the React Compiler memoizes watch() and the Send button would stay
    // disabled while typing.
    const text = useWatch({ control: form.control, name: 'message' })
    const canSend =
        !streaming && !voiceActive && text.trim() !== '' && text.length <= COACH_MESSAGE_MAX_CHARS

    // The panel stays mounted while it animates out, so a recording is dropped as soon as it closes.
    useEffect(() => {
        if (!open) cancelVoice()
    }, [open, cancelVoice])

    const listRef = useRef<HTMLDivElement | null>(null)
    const stickRef = useRef(true)
    const [previousStatus, setPreviousStatus] = useState<ChatStatus>(status)
    const [announcement, setAnnouncement] = useState('')

    // Follows the newest text unless the athlete scrolled up.
    useEffect(() => {
        const list = listRef.current
        if (list && stickRef.current) list.scrollTop = list.scrollHeight
        // oxlint-disable-next-line react/exhaustive-effect-dependencies -- scrolls when the messages change; the effect itself only reads refs
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
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4"
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
                        submit(streaming || voiceActive)
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
                                        rows={2}
                                        aria-label="Message to Migueli Coach"
                                        placeholder="Ask Migueli Coach..."
                                        data-testid="coach-input"
                                        readOnly={voiceWriting}
                                        className="min-h-0 max-h-32"
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'Enter' &&
                                                !event.shiftKey &&
                                                !event.nativeEvent.isComposing
                                            ) {
                                                event.preventDefault()
                                                submit(streaming || voiceActive)
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
                                <CoachVoiceError voice={voice} />
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
                    <div
                        data-testid="coach-compose-actions"
                        className={cn('flex items-center gap-2', voiceActive && 'max-md:hidden')}
                    >
                        <CoachVoiceButton voice={voice} />
                        <Button
                            type="submit"
                            size="icon"
                            aria-label="Send"
                            data-testid="coach-send"
                            disabled={!canSend}
                        >
                            <SendIcon />
                        </Button>
                    </div>
                </form>
            </Form>
            <CoachVoicePanel voice={voice} />
            <CoachModelCaption modelId={modelId} />
        </>
    )
}
