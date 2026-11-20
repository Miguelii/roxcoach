import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { COACH_MESSAGE_MAX_CHARS } from '@/modules/coach/suggestions'

const composerSchema = z.object({
    message: z
        .string()
        .max(
            COACH_MESSAGE_MAX_CHARS,
            `Messages can have up to ${COACH_MESSAGE_MAX_CHARS} characters`
        ),
})

type FormValues = z.infer<typeof composerSchema>

type Options = { onSend: (text: string) => void }

export function useCoachComposer({ onSend }: Options) {
    const form = useForm<FormValues>({
        resolver: zodResolver(composerSchema),
        mode: 'onChange',
        defaultValues: { message: '' },
    })

    // Sends the trimmed text and clears the input. Empty and over-long text is never sent.
    const submit = (streaming: boolean) => {
        const text = form.getValues('message').trim()
        if (streaming || text === '' || text.length > COACH_MESSAGE_MAX_CHARS) return
        onSend(text)
        form.reset({ message: '' })
    }

    return { form, submit }
}
