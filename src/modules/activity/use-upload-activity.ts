import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

type Status = 'idle' | 'uploading' | 'error' | 'success'

type Options = { upload?: (form: FormData) => Promise<Response>; onSuccess?: () => void }

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

type FormValues = z.infer<typeof uploadSchema>

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

    const uploadingRef = useRef(false)
    const hyroxTouchedRef = useRef(false)
    const [inputKey, setInputKey] = useState(0)

    const file = useWatch({ control: form.control, name: 'file' })
    const showHyroxOption = !(file && extensionOf(file.name) === 'gpx')

    const selectFile = async (next: File | undefined) => {
        setStatus('idle')
        setErrorMessage(null)
        hyroxTouchedRef.current = false
        form.setValue('hyrox', false)
        if (!next) {
            form.reset()
            return
        }
        form.setValue('file', next, { shouldValidate: true })
        if (extensionOf(next.name) === 'tcx') {
            const head = await next.slice(0, 4096).text()
            // Ignore a late read when the file changed or the user already chose a value.
            if (form.getValues('file') !== next || hyroxTouchedRef.current) return
            if (detectHyroxHint(head)) form.setValue('hyrox', true)
        }
    }

    const setHyrox = (value: boolean) => {
        hyroxTouchedRef.current = true
        form.setValue('hyrox', value)
    }

    const reset = () => {
        form.reset()
        hyroxTouchedRef.current = false
        setStatus('idle')
        setErrorMessage(null)
        setInputKey((key) => key + 1)
    }

    const run = async (values: FormValues) => {
        if (uploadingRef.current) return
        uploadingRef.current = true
        setStatus('uploading')
        setErrorMessage(null)
        const body = new FormData()
        body.append('file', values.file)
        if (values.hyrox && extensionOf(values.file.name) !== 'gpx') body.append('hyrox', 'true')
        try {
            const response = await upload(body)
            if (response.ok) {
                setStatus('success')
                reset()
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
        } finally {
            uploadingRef.current = false
        }
    }

    const submit = (event?: React.BaseSyntheticEvent) => form.handleSubmit(run)(event)

    return {
        form,
        file,
        submit,
        selectFile,
        setHyrox,
        reset,
        inputKey,
        status,
        errorMessage,
        showHyroxOption,
    }
}
