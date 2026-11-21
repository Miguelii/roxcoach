import type { ComponentProps } from 'react'
import Markdown from 'react-markdown'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/modules/coach/use-coach-chat'

type Props = { message: ChatMessage }

function ExternalLink({ href, children }: ComponentProps<'a'>) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
        </a>
    )
}

// No raw HTML (react-markdown escapes it), no images, and the default URL filter drops
// javascript: links. Links open in a new tab without opener access.
const DISALLOWED = ['img']

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
                        <Markdown
                            disallowedElements={DISALLOWED}
                            unwrapDisallowed
                            components={{ a: ExternalLink }}
                        >
                            {message.content}
                        </Markdown>
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
