'use client'

import { useEffect, useRef, useState } from 'react'
import { trpcClient } from '@/lib/trpc'
import { CoachChatView } from '@/modules/coach/coach-chat-view'
import { COACH_SUGGESTIONS } from '@/modules/coach/suggestions'
import { useCoachChat } from '@/modules/coach/use-coach-chat'

// Wires the hook to the conversation queries. The list refreshes after every completed reply
// (the first one creates the conversation) and after a delete.
export function CoachChat() {
    const [open, setOpen] = useState(false)
    const utils = trpcClient.useUtils()
    const conversations = trpcClient.coach.listConversations.useQuery(undefined, { enabled: open })
    const remove = trpcClient.coach.deleteConversation.useMutation()
    const chat = useCoachChat({
        loadMessages: (conversationId) =>
            utils.coach.getConversationMessages.fetch({ conversationId }),
        onReply: () => void utils.coach.listConversations.invalidate(),
    })

    // The panel opens on the latest conversation, once, unless the athlete already started one.
    const resumedRef = useRef(false)
    const { conversationId, messages, openConversation } = chat
    const latest = conversations.data?.[0]
    useEffect(() => {
        if (!open || resumedRef.current || !latest) return
        resumedRef.current = true
        if (conversationId === null && messages.length === 0) void openConversation(latest.id)
    }, [open, latest, conversationId, messages.length, openConversation])

    const onDelete = (id: string) => {
        remove.mutate(
            { conversationId: id },
            {
                onSuccess: () => {
                    if (chat.conversationId === id) chat.newConversation()
                    void utils.coach.listConversations.invalidate()
                },
            }
        )
    }

    return (
        <CoachChatView
            open={open}
            onOpenChange={setOpen}
            messages={chat.messages}
            status={chat.status}
            errorKind={chat.errorKind}
            conversationId={chat.conversationId}
            modelId={chat.modelId}
            conversations={conversations.data}
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
