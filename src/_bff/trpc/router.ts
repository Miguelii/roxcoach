import { router } from '@/_bff/trpc/server'
import { AUTH_ROUTER } from '@/_bff/modules/auth/auth.router'

export const appRouter = router({
    auth: AUTH_ROUTER,
})

export type AppRouter = typeof appRouter
