import { QueryCache, QueryClient } from '@tanstack/react-query'
import { TRPCClientError } from '@trpc/client'
import { toast } from 'sonner'
import { QUERY_STALE_TIME_MS } from '@/lib/constants'
import { FALLBACK_QUERY_ERROR_MESSAGE } from '@/lib/query-meta'

const MAX_RETRIES = 2

// A 4xx answer (expired session, forbidden, not found) will not change by asking again.
const retryServerErrors = (failureCount: number, error: Error) =>
    failureCount < MAX_RETRIES &&
    !(error instanceof TRPCClientError && (error.data?.httpStatus ?? 500) < 500)

// Every query load error is toasted here, once. The query hash as id dedupes a refetch that fails
// again and a query shared by two components.
export const makeQueryClient = () =>
    new QueryClient({
        queryCache: new QueryCache({
            onError: (_error, query) =>
                void toast.error(query.meta?.errorMessage ?? FALLBACK_QUERY_ERROR_MESSAGE, {
                    id: query.queryHash,
                }),
        }),
        defaultOptions: {
            queries: { staleTime: QUERY_STALE_TIME_MS, retry: retryServerErrors },
        },
    })
