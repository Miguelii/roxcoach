import 'server-only'

import { cache } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { createContext } from '@/_bff/trpc/context'
import { appRouter } from '@/_bff/trpc/router'

/**
 * Request-scoped query client plus a tRPC options proxy that calls the router in process (no HTTP).
 * Server Components prefetch with `queryClient.query(trpc.x.queryOptions(...))`, which uses the
 * same query keys the client hooks read, then pass `dehydrate(queryClient)` to a `HydrationBoundary`
 * so the client starts with the data.
 */
export const getServerTrpc = cache(() => {
    const queryClient = new QueryClient()
    const trpc = createTRPCOptionsProxy({ router: appRouter, ctx: createContext, queryClient })
    return { queryClient, trpc }
})
