import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

const MAX_BYTES = 10 * 1024 * 1024
const EXTENSIONS = new Set(['fit', 'tcx', 'gpx'])
const errorBody = z.object({ error: z.string() })
const GENERIC_ERROR = 'Something went wrong. Try again.'

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

const uploadSchema = z.object({
    file: z
        .instanceof(File, { message: 'Choose a file' })
        .refine((file) => EXTENSIONS.has(extensionOf(file.name)), 'Use a FIT, TCX or GPX file')
        .refine((file) => file.size <= MAX_BYTES, 'The file is larger than 10 MB'),
    hyrox: z.boolean(),
})

export type FormValues = z.infer<typeof uploadSchema>

type Status = 'idle' | 'uploading' | 'error' | 'success'

type Options = { upload?: (form: FormData) => Promise<Response>; onSuccess?: () => void }

const defaultUpload = (body: FormData) => fetch('/api/activities/upload', { method: 'POST', body })

// True when the text mentions HYROX, case-insensitive.
export const detectHyroxHint = (text: string) => /hyrox/iu.test(text)

export function useUploadActivity({ upload = defaultUpload, onSuccess }: Options = {}) {
    const [status, setStatus] = useState<Status>('idle')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const form = useForm<FormValues>({
        resolver: zodResolver(uploadSchema),
        mode: 'onChange',
        defaultValues: { file: undefined, hyrox: false },
    })

    const file = useWatch({ control: form.control, name: 'file' })
    const showHyroxOption = !(file && extensionOf(file.name) === 'gpx')

    const selectFile = async (next: File | undefined) => {
        setStatus('idle')
        setErrorMessage(null)
        form.setValue('hyrox', false)
        if (!next) {
            form.reset()
            return
        }
        form.setValue('file', next, { shouldValidate: true })
        if (extensionOf(next.name) === 'tcx') {
            const head = await next.slice(0, 4096).text()
            if (detectHyroxHint(head)) form.setValue('hyrox', true)
        }
    }

    const submit = form.handleSubmit(async (values) => {
        setStatus('uploading')
        setErrorMessage(null)
        const body = new FormData()
        body.append('file', values.file)
        if (values.hyrox && extensionOf(values.file.name) !== 'gpx') body.append('hyrox', 'true')
        try {
            const response = await upload(body)
            if (response.ok) {
                setStatus('success')
                form.reset()
                onSuccess?.()
                return
            }
            const data: unknown = await response.json().catch(() => null)
            const parsed = errorBody.safeParse(data)
            const message = parsed.success ? parsed.data.error : GENERIC_ERROR
            setErrorMessage(message)
            setStatus('error')
        } catch {
            setErrorMessage(GENERIC_ERROR)
            setStatus('error')
        }
    })

    return { form, file, submit, selectFile, status, errorMessage, showHyroxOption }
}
