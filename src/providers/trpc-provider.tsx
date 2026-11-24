'use client'

import { useState, type PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client'
import type { AppRouter } from '@/_bff/trpc/router'
import { QUERY_STALE_TIME_MS } from '@/lib/constants'
import { TRPCProvider } from '@/lib/trpc'

type Props = PropsWithChildren

const MAX_RETRIES = 2

// A 4xx answer (expired session, forbidden, not found) will not change by asking again.
const retryServerErrors = (failureCount: number, error: Error) =>
    failureCount < MAX_RETRIES &&
    !(error instanceof TRPCClientError && (error.data?.httpStatus ?? 500) < 500)

export function TrpcContextProvider({ children }: Props) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: { staleTime: QUERY_STALE_TIME_MS, retry: retryServerErrors },
                },
            })
    )
    const [trpcClient] = useState(() =>
        createTRPCClient<AppRouter>({
            links: [
                httpBatchLink({
                    url: '/api/trpc',
                }),
            ],
        })
    )

    return (
        <QueryClientProvider client={queryClient}>
            <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
                {children}
            </TRPCProvider>
        </QueryClientProvider>
    )
}
