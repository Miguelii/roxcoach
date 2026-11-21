import { QueryClient } from '@tanstack/react-query'
import { createTRPCClient } from '@trpc/client'
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import type { AppRouter } from '@/_bff/trpc/router'

// Test double for `@/lib/trpc`: the real options proxy over a client with no links, so components
// build real query keys and filters without a provider and nothing reaches the network. Tests
// route `useQuery` / `useMutation` by procedure path with `routeTrpc`.
export const fakeTrpc = createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient<AppRouter>({ links: [] }),
    queryClient: new QueryClient(),
})

export const useTRPC = () => fakeTrpc
