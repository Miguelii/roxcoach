import '@tanstack/react-query'

export const FALLBACK_QUERY_ERROR_MESSAGE = 'Could not load your data.'

declare module '@tanstack/react-query' {
    interface Register {
        queryMeta: { errorMessage?: string }
    }
}
