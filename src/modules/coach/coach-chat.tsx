'use client'

import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/lib/trpc'
import { CoachChatView } from '@/modules/coach/coach-chat-view'
import { useCoachPanel } from '@/modules/coach/coach-panel-context'
import { COACH_SUGGESTIONS } from '@/modules/coach/suggestions'
import { useCoachChat } from '@/modules/coach/use-coach-chat'

// Wires the hook to the conversation queries. The list refreshes after every completed reply
// (the first one creates the conversation) and after a delete.
export function CoachChat() {
    const trpc = useTRPC()
    const { open, setOpen, enabled, setEnabled } = useCoachPanel()
    const queryClient = useQueryClient()
    const conversations = useQuery(
        trpc.coach.listConversations.queryOptions(undefined, { enabled: open })
    )
    const remove = useMutation(trpc.coach.deleteConversation.mutationOptions())
    const chat = useCoachChat({
        loadMessages: (conversationId) =>
            queryClient.query(trpc.coach.getConversationMessages.queryOptions({ conversationId })),
        onReply: () =>
            void queryClient.invalidateQueries(trpc.coach.listConversations.queryFilter()),
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
                    void queryClient.invalidateQueries(trpc.coach.listConversations.queryFilter())
                },
            }
        )
    }

    return (
        <CoachChatView
            open={open}
            onOpenChange={setOpen}
            launcherEnabled={enabled}
            onDismissLauncher={() => {
                setEnabled(false)
                //toast('Coach bar hidden. Turn it back on in the sidebar.')
            }}
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
