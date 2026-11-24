import { lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/modules/coach/use-coach-chat'

type Props = { message: ChatMessage }

type MarkdownFallbackProps = { content: string }

const loadCoachMarkdown = () =>
    import('@/modules/coach/coach-markdown').then((module) => ({ default: module.CoachMarkdown }))

// react-markdown and its parser stack stay out of the first-load bundle: they load when the first
// assistant reply renders, or earlier when the launcher is hovered (see `preloadCoachMarkdown`).
const CoachMarkdown = lazy(loadCoachMarkdown)

export const preloadCoachMarkdown = () => void loadCoachMarkdown()

function MarkdownFallback({ content }: MarkdownFallbackProps) {
    return <p className="whitespace-pre-wrap break-words">{content}</p>
}

export function CoachMessage({ message }: Props) {
    const isUser = message.role === 'user'
    return (
        <div
            data-testid={`coach-message-${message.role}`}
            className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}
        >
            <div
                className={cn(
                    'max-w-[90%] rounded-[var(--radius-surface)] px-3.5 py-2.5 text-sm',
                    isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                )}
            >
                {isUser ? (
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                ) : (
                    <div
                        data-testid="coach-message-markdown"
                        className="space-y-2 break-words [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    >
                        <Suspense fallback={<MarkdownFallback content={message.content} />}>
                            <CoachMarkdown content={message.content} />
                        </Suspense>
                    </div>
                )}
            </div>
            {message.incomplete ? (
                <p data-testid="coach-incomplete" className="text-xs text-muted-foreground">
                    Incomplete reply
                </p>
            ) : null}
        </div>
    )
}
