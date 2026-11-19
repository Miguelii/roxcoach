import 'server-only'

import { createContext } from '@/_bff/trpc/context'
import { appRouter } from '@/_bff/trpc/router'

// Server-side caller for Server Components: builds the same context as the HTTP handler.
export const createCaller = async () => appRouter.createCaller(await createContext())
