import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return
    const { logRequestError } = await import('@/_bff/lib/request-error-logger')
    await logRequestError(error, request, context)
}
