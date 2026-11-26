import { zodResolver } from '@hookform/resolvers/zod'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { COACH_MESSAGE_MAX_CHARS } from '@/modules/coach/suggestions'
import type { VoiceTarget } from '@/modules/coach/use-voice-recorder'

const composerSchema = z.object({
    message: z
        .string()
        .max(
            COACH_MESSAGE_MAX_CHARS,
            `Messages can have up to ${COACH_MESSAGE_MAX_CHARS} characters`
        ),
})

type FormValues = z.infer<typeof composerSchema>

type Options = { onSend: (text: string) => boolean }

const ENDS_IN_SPACE = /\s$/u

const joinVoiceText = (prefix: string, text: string) =>
    prefix === '' || ENDS_IN_SPACE.test(prefix) ? `${prefix}${text}` : `${prefix} ${text}`

export function useCoachComposer({ onSend }: Options) {
    const form = useForm<FormValues>({
        resolver: zodResolver(composerSchema),
        mode: 'onChange',
        defaultValues: { message: '' },
    })

    // Sends the trimmed text and clears the input. Empty and over-long text is never sent.
    const submit = (blocked: boolean) => {
        const text = form.getValues('message').trim()
        if (blocked || text === '' || text.length > COACH_MESSAGE_MAX_CHARS) return
        if (onSend(text)) form.reset({ message: '' })
    }

    // Voice text goes after what was already typed (the prefix), which is never changed.
    const prefixRef = useRef<string | null>(null)
    const voiceTarget: VoiceTarget = {
        begin: () => {
            prefixRef.current = form.getValues('message')
        },
        show: (text) => {
            if (prefixRef.current !== null)
                form.setValue('message', joinVoiceText(prefixRef.current, text))
        },
        commit: (text, intent) => {
            const prefix = prefixRef.current ?? form.getValues('message')
            prefixRef.current = null
            const joined = joinVoiceText(prefix, text)
            // The box is cleared only when the chat took the message (it refuses one while a reply
            // runs); otherwise the text waits in the box like a review.
            if (intent === 'send' && onSend(joined)) {
                form.reset({ message: '' })
                return
            }
            form.setValue('message', joined, { shouldValidate: true })
            form.setFocus('message')
        },
        discard: () => {
            if (prefixRef.current === null) return
            form.setValue('message', prefixRef.current, { shouldValidate: true })
            prefixRef.current = null
        },
    }

    return { form, submit, voiceTarget }
}
