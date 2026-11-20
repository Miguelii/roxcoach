import { HISTORY_WINDOW } from '@/_bff/modules/coach/constants'
import type { CoachMessage } from '@/_bff/modules/coach/providers/coach-model'
import type { MessageDTO } from '@/_bff/modules/coach/types'

// The last HISTORY_WINDOW messages in order. Leading assistant messages are dropped (some Gemini
// endpoints reject a history that starts with a model turn); the window still ends with the new
// user message. Consecutive user turns (an earlier attempt that got
// no reply) are merged into one turn joined by a blank line, so the model never sees two user
// turns in a row. A trailing assistant message is kept.
export const buildHistory = (messages: MessageDTO[]): CoachMessage[] => {
    const history: CoachMessage[] = []
    const windowed = messages.slice(-HISTORY_WINDOW)
    const firstUser = windowed.findIndex((message) => message.role === 'user')
    for (const message of firstUser === -1 ? [] : windowed.slice(firstUser)) {
        const last = history.at(-1)
        if (last && last.role === 'user' && message.role === 'user') {
            last.content = `${last.content}\n\n${message.content}`
        } else {
            history.push({ role: message.role, content: message.content })
        }
    }
    return history
}
