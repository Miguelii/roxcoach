import { createTRPCContext } from '@trpc/tanstack-react-query'
import type { AppRouter } from '@/_bff/trpc/router'

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>()
