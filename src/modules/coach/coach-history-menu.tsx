import { HistoryIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ConversationSummary = { id: string; title: string | null; updatedAt: string }

// A conversation is untitled until its first exchange names it.
const titleOf = (title: string | null) => title ?? 'Untitled conversation'

type Props = {
    // Undefined while the list loads.
    conversations: ConversationSummary[] | undefined
    currentId: string | null
    onNew: () => void
    onOpen: (id: string) => void
    onDelete: (id: string) => void
}

export function CoachHistoryMenu({ conversations, currentId, onNew, onOpen, onDelete }: Props) {
    const [open, setOpen] = useState(false)
    const [confirmId, setConfirmId] = useState<string | null>(null)

    const close = () => {
        setOpen(false)
        setConfirmId(null)
    }

    return (
        <div className="relative">
            <Button
                variant="ghost"
                size="icon"
                aria-label="Conversations menu"
                aria-expanded={open}
                data-testid="coach-menu-trigger"
                onClick={() => {
                    setOpen((value) => !value)
                    setConfirmId(null)
                }}
            >
                <HistoryIcon />
            </Button>
            {open ? (
                <div
                    data-testid="coach-menu"
                    className="absolute right-0 top-full z-10 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-[var(--radius-surface)] border border-hairline bg-popover p-2 text-popover-foreground shadow-md"
                >
                    <Button
                        variant="ghost"
                        className="w-full justify-start"
                        data-testid="coach-new-conversation"
                        onClick={() => {
                            close()
                            onNew()
                        }}
                    >
                        <PlusIcon /> New conversation
                    </Button>
                    <p className="eyebrow px-2 pt-2 text-muted-foreground">Past conversations</p>
                    {conversations === undefined ? (
                        <p data-testid="coach-history-loading" className="px-2 py-2 text-sm">
                            Loading...
                        </p>
                    ) : conversations.length === 0 ? (
                        <p
                            data-testid="coach-history-empty"
                            className="px-2 py-2 text-sm text-muted-foreground"
                        >
                            No past conversations yet
                        </p>
                    ) : (
                        <ul className="max-h-64 overflow-y-auto">
                            {conversations.map((conversation) => (
                                <li
                                    key={conversation.id}
                                    data-testid="coach-history-item"
                                    className="flex items-center gap-1"
                                >
                                    {confirmId === conversation.id ? (
                                        <div className="flex w-full items-center gap-2 px-2 py-1 text-sm">
                                            <span className="flex-1">
                                                Delete this conversation?
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                data-testid="coach-delete-confirm"
                                                onClick={() => {
                                                    setConfirmId(null)
                                                    onDelete(conversation.id)
                                                }}
                                            >
                                                Delete
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                data-testid="coach-delete-cancel"
                                                onClick={() => setConfirmId(null)}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <Button
                                                variant="ghost"
                                                className={cn(
                                                    'min-w-0 flex-1 justify-start',
                                                    conversation.id === currentId && 'bg-muted'
                                                )}
                                                data-testid="coach-history-open"
                                                onClick={() => {
                                                    close()
                                                    onOpen(conversation.id)
                                                }}
                                            >
                                                <span className="truncate">
                                                    {conversation.title}
                                                </span>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={`Delete ${titleOf(conversation.title)}`}
                                                data-testid="coach-history-delete"
                                                onClick={() => setConfirmId(conversation.id)}
                                            >
                                                <Trash2Icon />
                                            </Button>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </div>
    )
}
